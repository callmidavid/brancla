package git

import (
	"bytes"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type LocalBranch struct {
	Name              string
	SHA               string
	Upstream          string
	IsCurrent         bool
	HasUncommitted    bool
	LastCommitDate    time.Time
	LastCommitSubject string
	LastCommitAuthor  string
	Ahead             int
	Behind            int
}

type RepoInfo struct {
	Path          string
	Name          string
	Owner         string
	RemoteURL     string
	Provider      string // github, gitlab, bitbucket, generic
	DefaultBranch string
}

// GetRepoInfo parses git remote and repo root
func GetRepoInfo(repoPath string) (*RepoInfo, error) {
	// Find top level path
	rootCmd := exec.Command("git", "-C", repoPath, "rev-parse", "--show-toplevel")
	rootOut, err := rootCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %s", repoPath)
	}
	realPath := strings.TrimSpace(string(rootOut))

	// Get Remote URL
	remoteCmd := exec.Command("git", "-C", realPath, "config", "--get", "remote.origin.url")
	remoteOut, _ := remoteCmd.Output()
	remoteURL := strings.TrimSpace(string(remoteOut))

	// Get Default Branch (check main vs master vs origin/HEAD)
	defaultBranch := "main"
	headCmd := exec.Command("git", "-C", realPath, "symbolic-ref", "refs/remotes/origin/HEAD")
	if headOut, err := headCmd.Output(); err == nil {
		ref := strings.TrimSpace(string(headOut))
		parts := strings.Split(ref, "/")
		if len(parts) > 0 {
			defaultBranch = parts[len(parts)-1]
		}
	} else {
		// fallback: check if master exists
		checkMaster := exec.Command("git", "-C", realPath, "show-ref", "--verify", "--quiet", "refs/heads/master")
		if checkMaster.Run() == nil {
			defaultBranch = "master"
		}
	}

	owner, name, provider := parseRemoteURL(remoteURL)
	if name == "" {
		parts := strings.Split(realPath, "/")
		name = parts[len(parts)-1]
	}

	return &RepoInfo{
		Path:          realPath,
		Name:          name,
		Owner:         owner,
		RemoteURL:     remoteURL,
		Provider:      provider,
		DefaultBranch: defaultBranch,
	}, nil
}

func parseRemoteURL(rawURL string) (owner, repo, provider string) {
	if rawURL == "" {
		return "", "", "unknown"
	}
	provider = "github"
	if strings.Contains(rawURL, "gitlab.com") || strings.Contains(rawURL, "gitlab") {
		provider = "gitlab"
	}

	// Remove trailing .git
	clean := strings.TrimSuffix(rawURL, ".git")

	if strings.HasPrefix(clean, "git@") {
		// git@github.com:owner/repo
		parts := strings.Split(clean, ":")
		if len(parts) == 2 {
			subParts := strings.Split(parts[1], "/")
			if len(subParts) == 2 {
				return subParts[0], subParts[1], provider
			}
		}
	} else if strings.HasPrefix(clean, "http://") || strings.HasPrefix(clean, "https://") {
		// https://github.com/owner/repo
		parts := strings.Split(clean, "/")
		if len(parts) >= 2 {
			return parts[len(parts)-2], parts[len(parts)-1], provider
		}
	}
	return "", "", provider
}

// GetLocalBranches lists all local branches with git log details
func GetLocalBranches(repoPath string, defaultBranch string) ([]LocalBranch, error) {
	// Check uncommitted changes on current branch
	statusCmd := exec.Command("git", "-C", repoPath, "status", "--porcelain")
	statusOut, _ := statusCmd.Output()
	hasUncommitted := len(bytes.TrimSpace(statusOut)) > 0

	// Format: %(refname:short)|%(objectname)|%(upstream:short)|%(HEAD)|%(committerdate:iso-strict)|%(authorname)|%(subject)
	format := "%(refname:short)|%(objectname)|%(upstream:short)|%(HEAD)|%(committerdate:iso-strict)|%(authorname)|%(subject)"
	cmd := exec.Command("git", "-C", repoPath, "for-each-ref", "--format="+format, "refs/heads/")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch local branches: %w", err)
	}

	lines := strings.Split(string(out), "\n")
	var branches []LocalBranch

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) < 7 {
			continue
		}

		name := parts[0]
		sha := parts[1]
		upstream := parts[2]
		isCurrent := parts[3] == "*"
		dateStr := parts[4]
		author := parts[5]
		subject := parts[6]

		commitDate, _ := time.Parse(time.RFC3339, dateStr)

		ahead, behind := 0, 0
		if upstream != "" {
			abCmd := exec.Command("git", "-C", repoPath, "rev-list", "--left-right", "--count", name+"..."+upstream)
			if abOut, err := abCmd.Output(); err == nil {
				counts := strings.Fields(string(abOut))
				if len(counts) == 2 {
					ahead, _ = strconv.Atoi(counts[0])
					behind, _ = strconv.Atoi(counts[1])
				}
			}
		} else if defaultBranch != "" && name != defaultBranch {
			// Compare with default branch origin/defaultBranch or defaultBranch
			target := "origin/" + defaultBranch
			abCmd := exec.Command("git", "-C", repoPath, "rev-list", "--left-right", "--count", name+"..."+target)
			if abOut, err := abCmd.Output(); err == nil {
				counts := strings.Fields(string(abOut))
				if len(counts) == 2 {
					ahead, _ = strconv.Atoi(counts[0])
					behind, _ = strconv.Atoi(counts[1])
				}
			}
		}

		branches = append(branches, LocalBranch{
			Name:              name,
			SHA:               sha,
			Upstream:          upstream,
			IsCurrent:         isCurrent,
			HasUncommitted:    isCurrent && hasUncommitted,
			LastCommitDate:    commitDate,
			LastCommitSubject: subject,
			LastCommitAuthor:  author,
			Ahead:             ahead,
			Behind:            behind,
		})
	}

	return branches, nil
}

// RemoteBranchExists checks if origin/<branch> exists locally in tracking or on remote server
func RemoteBranchExists(repoPath string, branchName string) bool {
	// 1. Check local remote tracking ref origin/<branch>
	cmd := exec.Command("git", "-C", repoPath, "show-ref", "--verify", "--quiet", "refs/remotes/origin/"+branchName)
	if err := cmd.Run(); err == nil {
		return true
	}

	// 2. Query ls-remote to double check remote server
	lsCmd := exec.Command("git", "-C", repoPath, "ls-remote", "--heads", "origin", branchName)
	out, err := lsCmd.Output()
	if err == nil && len(bytes.TrimSpace(out)) > 0 {
		return true
	}

	return false
}

// FetchPrune updates remote refs
func FetchPrune(repoPath string) error {
	cmd := exec.Command("git", "-C", repoPath, "fetch", "--prune", "origin")
	return cmd.Run()
}

// CreateBackupRef creates a git ref under refs/brancla/backups/ so the branch SHA is preserved safely
func CreateBackupRef(repoPath string, branchName string, sha string) (string, error) {
	timestamp := time.Now().Format("20060102-150405")
	refName := fmt.Sprintf("refs/brancla/backups/%s-%s", strings.ReplaceAll(branchName, "/", "-"), timestamp)

	cmd := exec.Command("git", "-C", repoPath, "update-ref", refName, sha)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to create backup ref %s: %w", refName, err)
	}
	return refName, nil
}

// DeleteLocalBranch deletes local branch using git branch -D
func DeleteLocalBranch(repoPath string, branchName string) error {
	cmd := exec.Command("git", "-C", repoPath, "branch", "-D", branchName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git branch -D %s failed: %s", branchName, string(output))
	}
	return nil
}

// RestoreLocalBranch recreates local branch from SHA
func RestoreLocalBranch(repoPath string, branchName string, sha string) error {
	cmd := exec.Command("git", "-C", repoPath, "branch", branchName, sha)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to restore branch %s: %s", branchName, string(output))
	}
	return nil
}

// CheckSquashMerged checks if branch commits exist in target branch even if SHAs differ
func CheckSquashMerged(repoPath string, branchName string, defaultBranch string) bool {
	// Get merge base
	mbCmd := exec.Command("git", "-C", repoPath, "merge-base", branchName, defaultBranch)
	mbOut, err := mbCmd.Output()
	if err != nil {
		return false
	}
	mergeBase := strings.TrimSpace(string(mbOut))

	// Get tree of branchName
	treeCmd := exec.Command("git", "-C", repoPath, "rev-parse", branchName+"^{tree}")
	treeOut, err := treeCmd.Output()
	if err != nil {
		return false
	}
	branchTree := strings.TrimSpace(string(treeOut))

	// Check if this tree matches any commit tree in defaultBranch since mergeBase
	logCmd := exec.Command("git", "-C", repoPath, "log", mergeBase+".."+defaultBranch, "--format=%T")
	logOut, err := logCmd.Output()
	if err != nil {
		return false
	}

	trees := strings.Split(string(logOut), "\n")
	for _, t := range trees {
		if strings.TrimSpace(t) == branchTree {
			return true
		}
	}

	// Secondary check: patch-id check or cherry-pick check
	cherryCmd := exec.Command("git", "-C", repoPath, "cherry", defaultBranch, branchName)
	if cherryOut, err := cherryCmd.Output(); err == nil {
		lines := strings.Split(strings.TrimSpace(string(cherryOut)), "\n")
		allEquivalent := true
		for _, l := range lines {
			if strings.HasPrefix(l, "+") { // + means commit not in target
				allEquivalent = false
				break
			}
		}
		if len(lines) > 0 && allEquivalent {
			return true
		}
	}

	return false
}
