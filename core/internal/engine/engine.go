package engine

import (
	"fmt"
	"path/filepath"
	"time"

	"github.com/callmidavid/brancla/core/git"
	"github.com/callmidavid/brancla/core/internal/database"
	"github.com/callmidavid/brancla/core/internal/safety"
	"github.com/callmidavid/brancla/core/providers"
)

type Engine struct {
	db       *database.DB
	githubPr *providers.GitHubProvider
	gitlabPr *providers.GitLabProvider
}

func NewEngine(db *database.DB) *Engine {
	return &Engine{
		db:       db,
		githubPr: providers.NewGitHubProvider(),
		gitlabPr: providers.NewGitLabProvider(),
	}
}

// ScanRepository scans git repository and updates DB
func (e *Engine) ScanRepository(repoPath string) (*database.Repository, []database.BranchRecord, error) {
	absPath, err := filepath.Abs(repoPath)
	if err != nil {
		absPath = repoPath
	}

	info, err := git.GetRepoInfo(absPath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read git repo: %w", err)
	}

	repo := &database.Repository{
		Path:          info.Path,
		Name:          info.Name,
		Owner:         info.Owner,
		RemoteURL:     info.RemoteURL,
		Provider:      info.Provider,
		DefaultBranch: info.DefaultBranch,
		LastScannedAt: time.Now(),
	}

	repoID, err := e.db.UpsertRepository(repo)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to save repository: %w", err)
	}
	repo.ID = repoID

	// Fetch prune remote branches first
	_ = git.FetchPrune(absPath)

	// Get local branches
	localBranches, err := git.GetLocalBranches(absPath, info.DefaultBranch)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get local branches: %w", err)
	}

	var branchRecords []database.BranchRecord

	for _, lb := range localBranches {
		remoteExists := git.RemoteBranchExists(absPath, lb.Name)
		isSquashMerged := false
		if !remoteExists && !lb.IsCurrent && !safety.IsProtectedBranch(lb.Name, info.DefaultBranch) {
			isSquashMerged = git.CheckSquashMerged(absPath, lb.Name, info.DefaultBranch)
		}

		// Attempt remote PR lookup if remote URL is github/gitlab
		var prInfo *providers.PRInfo
		if info.Owner != "" && info.Name != "" && !safety.IsProtectedBranch(lb.Name, info.DefaultBranch) {
			if info.Provider == "github" {
				if pr, err := e.githubPr.FetchPRForBranch(info.Owner, info.Name, lb.Name); err == nil {
					prInfo = pr
				}
			} else if info.Provider == "gitlab" {
				if pr, err := e.gitlabPr.FetchMRForBranch(info.Owner, info.Name, lb.Name); err == nil {
					prInfo = pr
				}
			}
		}

		assessment := safety.AnalyzeBranch(lb, prInfo, remoteExists, info.DefaultBranch, isSquashMerged)

		rec := database.BranchRecord{
			RepoID:            repoID,
			Name:              lb.Name,
			SHA:               lb.SHA,
			Upstream:          lb.Upstream,
			Ahead:             lb.Ahead,
			Behind:            lb.Behind,
			IsCurrent:         lb.IsCurrent,
			HasUncommitted:    lb.HasUncommitted,
			LastCommitDate:    lb.LastCommitDate,
			LastCommitSubject: lb.LastCommitSubject,
			LastCommitAuthor:  lb.LastCommitAuthor,
			RemoteBranchExists: remoteExists,
			SafetyStatus:      assessment.Status,
			SafetyScore:       assessment.Score,
			SafetyReason:      assessment.Reason,
		}

		if prInfo != nil {
			rec.PRNumber = prInfo.Number
			rec.PRTitle = prInfo.Title
			rec.PRState = prInfo.State
			rec.PRURL = prInfo.URL
		}

		if err := e.db.SaveBranch(&rec); err != nil {
			return nil, nil, fmt.Errorf("failed to save branch record: %w", err)
		}

		branchRecords = append(branchRecords, rec)
	}

	return repo, branchRecords, nil
}

// DeleteBranches creates git ref backups and deletes specified branches
func (e *Engine) DeleteBranches(repoPath string, branchNames []string) ([]string, map[string]error) {
	deleted := []string{}
	errs := make(map[string]error)

	repo, err := e.db.GetRepository(repoPath)
	if err != nil {
		errs["general"] = err
		return deleted, errs
	}

	branches, err := e.db.GetBranches(repo.ID)
	if err != nil {
		errs["general"] = err
		return deleted, errs
	}

	branchMap := make(map[string]database.BranchRecord)
	for _, b := range branches {
		branchMap[b.Name] = b
	}

	for _, name := range branchNames {
		b, exists := branchMap[name]
		if !exists {
			errs[name] = fmt.Errorf("branch '%s' not found in database", name)
			continue
		}

		if b.IsCurrent {
			errs[name] = fmt.Errorf("cannot delete currently checked out branch '%s'", name)
			continue
		}

		if safety.IsProtectedBranch(name, repo.DefaultBranch) {
			errs[name] = fmt.Errorf("branch '%s' is protected", name)
			continue
		}

		// 1. Create backup ref
		refName, err := git.CreateBackupRef(repoPath, name, b.SHA)
		if err != nil {
			errs[name] = fmt.Errorf("backup failed: %w", err)
			continue
		}

		// Save backup log
		_ = e.db.SaveBackup(&database.BranchBackup{
			RepoPath:   repoPath,
			BranchName: name,
			SHA:        b.SHA,
			RefName:    refName,
			CreatedAt:  time.Now(),
		})

		// 2. Delete local branch
		if err := git.DeleteLocalBranch(repoPath, name); err != nil {
			errs[name] = err
			continue
		}

		// 3. Remove from DB
		_ = e.db.DeleteBranchRecord(repo.ID, name)
		deleted = append(deleted, name)
	}

	return deleted, errs
}

// RestoreBranch restores a deleted branch from database backup log
func (e *Engine) RestoreBranch(repoPath string, branchName string) error {
	backups, err := e.db.ListBackups(repoPath)
	if err != nil {
		return err
	}

	var targetBackup *database.BranchBackup
	for _, bk := range backups {
		if bk.BranchName == branchName {
			targetBackup = &bk
			break
		}
	}

	if targetBackup == nil {
		return fmt.Errorf("no backup found for branch '%s'", branchName)
	}

	if err := git.RestoreLocalBranch(repoPath, branchName, targetBackup.SHA); err != nil {
		return err
	}

	// Re-scan repository
	_, _, _ = e.ScanRepository(repoPath)
	return nil
}

// GetDB returns database handle
func (e *Engine) GetDB() *database.DB {
	return e.db
}
