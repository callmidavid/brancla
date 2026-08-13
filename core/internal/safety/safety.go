package safety

import (
	"fmt"
	"strings"

	"github.com/callmidavid/brancla/core/git"
	"github.com/callmidavid/brancla/core/providers"
)

type SafetyAssessment struct {
	Status string // SAFE_TO_DELETE, SAFE_SQUASH_MERGED, WARNING_CLOSED_PR, WARNING_UNMERGED, PROTECTED, CURRENT
	Score  int    // 0 - 100
	Reason string
}

var ProtectedBranchPatterns = []string{
	"main", "master", "dev", "develop", "development", "staging", "prod", "production",
}

func AnalyzeBranch(localBranch git.LocalBranch, pr *providers.PRInfo, remoteExists bool, defaultBranch string, isSquashMerged bool) SafetyAssessment {
	name := localBranch.Name

	// 1. Current Branch Check
	if localBranch.IsCurrent {
		return SafetyAssessment{
			Status: "CURRENT",
			Score:  0,
			Reason: "Currently checked out active branch",
		}
	}

	// 2. Protected Branch Check
	if IsProtectedBranch(name, defaultBranch) {
		return SafetyAssessment{
			Status: "PROTECTED",
			Score:  0,
			Reason: fmt.Sprintf("Branch '%s' is protected", name),
		}
	}

	// 3. Merged PR on GitHub/GitLab
	if pr != nil && pr.State == "MERGED" {
		if !remoteExists {
			return SafetyAssessment{
				Status: "SAFE_TO_DELETE",
				Score:  100,
				Reason: fmt.Sprintf("PR #%d was MERGED and remote branch was deleted", pr.Number),
			}
		}
		return SafetyAssessment{
			Status: "SAFE_TO_DELETE",
			Score:  95,
			Reason: fmt.Sprintf("PR #%d was MERGED on remote", pr.Number),
		}
	}

	// 4. Squashed Merge local check
	if isSquashMerged {
		return SafetyAssessment{
			Status: "SAFE_SQUASH_MERGED",
			Score:  95,
			Reason: "Commits squashed & merged into " + defaultBranch,
		}
	}

	// 5. Remote Branch Deleted (Dead on Remote)
	if !remoteExists {
		if localBranch.Ahead > 0 {
			return SafetyAssessment{
				Status: "WARNING_UNMERGED",
				Score:  35,
				Reason: fmt.Sprintf("Dead on remote, but has %d unpushed local commit(s)", localBranch.Ahead),
			}
		}

		if pr != nil && pr.State == "CLOSED" {
			return SafetyAssessment{
				Status: "WARNING_CLOSED_PR",
				Score:  60,
				Reason: fmt.Sprintf("PR #%d was CLOSED without merge; remote branch deleted", pr.Number),
			}
		}

		return SafetyAssessment{
			Status: "SAFE_TO_DELETE",
			Score:  90,
			Reason: "Remote branch deleted and no unpushed local commits",
		}
	}

	// 6. Branch still alive on remote
	if localBranch.Ahead == 0 && localBranch.Behind > 0 {
		return SafetyAssessment{
			Status: "WARNING_UNMERGED",
			Score:  40,
			Reason: fmt.Sprintf("Remote branch exists and is %d commits ahead of local", localBranch.Behind),
		}
	}

	return SafetyAssessment{
		Status: "WARNING_UNMERGED",
		Score:  20,
		Reason: "Branch exists on remote with active/unmerged work",
	}
}

func IsProtectedBranch(name string, defaultBranch string) bool {
	if strings.EqualFold(name, defaultBranch) {
		return true
	}
	nameLower := strings.ToLower(name)
	for _, p := range ProtectedBranchPatterns {
		if nameLower == p || strings.HasPrefix(nameLower, "release/") || strings.HasPrefix(nameLower, "hotfix-prod") {
			return true
		}
	}
	return false
}
