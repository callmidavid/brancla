package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

type Repository struct {
	ID            int64     `json:"id"`
	Path          string    `json:"path"`
	Name          string    `json:"name"`
	Owner         string    `json:"owner"`
	RemoteURL     string    `json:"remoteUrl"`
	Provider      string    `json:"provider"`
	DefaultBranch string    `json:"defaultBranch"`
	LastScannedAt time.Time `json:"lastScannedAt"`
}

type BranchRecord struct {
	ID                int64     `json:"id"`
	RepoID            int64     `json:"repoId"`
	Name              string    `json:"name"`
	SHA               string    `json:"sha"`
	Upstream          string    `json:"upstream"`
	Ahead             int       `json:"ahead"`
	Behind            int       `json:"behind"`
	IsCurrent         bool      `json:"isCurrent"`
	HasUncommitted    bool      `json:"hasUncommitted"`
	LastCommitDate    time.Time `json:"lastCommitDate"`
	LastCommitSubject string    `json:"lastCommitSubject"`
	LastCommitAuthor  string    `json:"lastCommitAuthor"`
	PRNumber          int       `json:"prNumber"`
	PRTitle           string    `json:"prTitle"`
	PRState           string    `json:"prState"` // MERGED, CLOSED, OPEN, NONE
	PRURL             string    `json:"prUrl"`
	RemoteBranchExists bool     `json:"remoteBranchExists"`
	SafetyStatus      string    `json:"safetyStatus"` // SAFE_TO_DELETE, WARNING_UNMERGED, PROTECTED, CURRENT
	SafetyScore       int       `json:"safetyScore"`  // 0 - 100
	SafetyReason      string    `json:"safetyReason"`
}

type BranchBackup struct {
	ID         int64     `json:"id"`
	RepoPath   string    `json:"repoPath"`
	BranchName string    `json:"branchName"`
	SHA        string    `json:"sha"`
	RefName    string    `json:"refName"`
	CreatedAt  time.Time `json:"createdAt"`
}

func InitDB() (*DB, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get user home dir: %w", err)
	}

	dbDir := filepath.Join(home, ".brancla")
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create brancla dir: %w", err)
	}

	dbPath := filepath.Join(dbDir, "brancla.db")
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return db, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS repositories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		path TEXT UNIQUE NOT NULL,
		name TEXT NOT NULL,
		owner TEXT NOT NULL DEFAULT '',
		remote_url TEXT NOT NULL DEFAULT '',
		provider TEXT NOT NULL DEFAULT 'unknown',
		default_branch TEXT NOT NULL DEFAULT 'main',
		last_scanned_at DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS branches (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo_id INTEGER NOT NULL,
		name TEXT NOT NULL,
		sha TEXT NOT NULL,
		upstream TEXT NOT NULL DEFAULT '',
		ahead INTEGER NOT NULL DEFAULT 0,
		behind INTEGER NOT NULL DEFAULT 0,
		is_current BOOLEAN NOT NULL DEFAULT 0,
		has_uncommitted BOOLEAN NOT NULL DEFAULT 0,
		last_commit_date DATETIME NOT NULL,
		last_commit_subject TEXT NOT NULL DEFAULT '',
		last_commit_author TEXT NOT NULL DEFAULT '',
		pr_number INTEGER NOT NULL DEFAULT 0,
		pr_title TEXT NOT NULL DEFAULT '',
		pr_state TEXT NOT NULL DEFAULT 'NONE',
		pr_url TEXT NOT NULL DEFAULT '',
		remote_branch_exists BOOLEAN NOT NULL DEFAULT 1,
		safety_status TEXT NOT NULL DEFAULT 'UNKNOWN',
		safety_score INTEGER NOT NULL DEFAULT 0,
		safety_reason TEXT NOT NULL DEFAULT '',
		FOREIGN KEY(repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
		UNIQUE(repo_id, name)
	);

	CREATE TABLE IF NOT EXISTS backups (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo_path TEXT NOT NULL,
		branch_name TEXT NOT NULL,
		sha TEXT NOT NULL,
		ref_name TEXT NOT NULL,
		created_at DATETIME NOT NULL
	);
	`

	_, err := db.conn.Exec(schema)
	return err
}

func (db *DB) UpsertRepository(repo *Repository) (int64, error) {
	query := `
	INSERT INTO repositories (path, name, owner, remote_url, provider, default_branch, last_scanned_at)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(path) DO UPDATE SET
		name=excluded.name,
		owner=excluded.owner,
		remote_url=excluded.remote_url,
		provider=excluded.provider,
		default_branch=excluded.default_branch,
		last_scanned_at=excluded.last_scanned_at
	RETURNING id;
	`
	var id int64
	err := db.conn.QueryRow(query, repo.Path, repo.Name, repo.Owner, repo.RemoteURL, repo.Provider, repo.DefaultBranch, time.Now()).Scan(&id)
	return id, err
}

func (db *DB) SaveBranch(b *BranchRecord) error {
	query := `
	INSERT INTO branches (
		repo_id, name, sha, upstream, ahead, behind, is_current, has_uncommitted,
		last_commit_date, last_commit_subject, last_commit_author, pr_number, pr_title,
		pr_state, pr_url, remote_branch_exists, safety_status, safety_score, safety_reason
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(repo_id, name) DO UPDATE SET
		sha=excluded.sha,
		upstream=excluded.upstream,
		ahead=excluded.ahead,
		behind=excluded.behind,
		is_current=excluded.is_current,
		has_uncommitted=excluded.has_uncommitted,
		last_commit_date=excluded.last_commit_date,
		last_commit_subject=excluded.last_commit_subject,
		last_commit_author=excluded.last_commit_author,
		pr_number=excluded.pr_number,
		pr_title=excluded.pr_title,
		pr_state=excluded.pr_state,
		pr_url=excluded.pr_url,
		remote_branch_exists=excluded.remote_branch_exists,
		safety_status=excluded.safety_status,
		safety_score=excluded.safety_score,
		safety_reason=excluded.safety_reason;
	`
	_, err := db.conn.Exec(query,
		b.RepoID, b.Name, b.SHA, b.Upstream, b.Ahead, b.Behind, b.IsCurrent, b.HasUncommitted,
		b.LastCommitDate, b.LastCommitSubject, b.LastCommitAuthor, b.PRNumber, b.PRTitle,
		b.PRState, b.PRURL, b.RemoteBranchExists, b.SafetyStatus, b.SafetyScore, b.SafetyReason,
	)
	return err
}

func (db *DB) GetRepository(path string) (*Repository, error) {
	row := db.conn.QueryRow(`SELECT id, path, name, owner, remote_url, provider, default_branch, last_scanned_at FROM repositories WHERE path = ?`, path)
	var repo Repository
	err := row.Scan(&repo.ID, &repo.Path, &repo.Name, &repo.Owner, &repo.RemoteURL, &repo.Provider, &repo.DefaultBranch, &repo.LastScannedAt)
	if err != nil {
		return nil, err
	}
	return &repo, nil
}

func (db *DB) ListRepositories() ([]Repository, error) {
	rows, err := db.conn.Query(`SELECT id, path, name, owner, remote_url, provider, default_branch, last_scanned_at FROM repositories ORDER BY last_scanned_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var repos []Repository
	for rows.Next() {
		var repo Repository
		if err := rows.Scan(&repo.ID, &repo.Path, &repo.Name, &repo.Owner, &repo.RemoteURL, &repo.Provider, &repo.DefaultBranch, &repo.LastScannedAt); err != nil {
			return nil, err
		}
		repos = append(repos, repo)
	}
	return repos, nil
}

func (db *DB) GetBranches(repoID int64) ([]BranchRecord, error) {
	query := `SELECT id, repo_id, name, sha, upstream, ahead, behind, is_current, has_uncommitted,
		last_commit_date, last_commit_subject, last_commit_author, pr_number, pr_title,
		pr_state, pr_url, remote_branch_exists, safety_status, safety_score, safety_reason
		FROM branches WHERE repo_id = ? ORDER BY safety_score DESC, name ASC`

	rows, err := db.conn.Query(query, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var branches []BranchRecord
	for rows.Next() {
		var b BranchRecord
		err := rows.Scan(
			&b.ID, &b.RepoID, &b.Name, &b.SHA, &b.Upstream, &b.Ahead, &b.Behind, &b.IsCurrent, &b.HasUncommitted,
			&b.LastCommitDate, &b.LastCommitSubject, &b.LastCommitAuthor, &b.PRNumber, &b.PRTitle,
			&b.PRState, &b.PRURL, &b.RemoteBranchExists, &b.SafetyStatus, &b.SafetyScore, &b.SafetyReason,
		)
		if err != nil {
			return nil, err
		}
		branches = append(branches, b)
	}
	return branches, nil
}

func (db *DB) DeleteBranchRecord(repoID int64, branchName string) error {
	_, err := db.conn.Exec(`DELETE FROM branches WHERE repo_id = ? AND name = ?`, repoID, branchName)
	return err
}

func (db *DB) SaveBackup(backup *BranchBackup) error {
	_, err := db.conn.Exec(
		`INSERT INTO backups (repo_path, branch_name, sha, ref_name, created_at) VALUES (?, ?, ?, ?, ?)`,
		backup.RepoPath, backup.BranchName, backup.SHA, backup.RefName, time.Now(),
	)
	return err
}

func (db *DB) ListBackups(repoPath string) ([]BranchBackup, error) {
	rows, err := db.conn.Query(`SELECT id, repo_path, branch_name, sha, ref_name, created_at FROM backups WHERE repo_path = ? ORDER BY created_at DESC`, repoPath)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var backups []BranchBackup
	for rows.Next() {
		var bk BranchBackup
		if err := rows.Scan(&bk.ID, &bk.RepoPath, &bk.BranchName, &bk.SHA, &bk.RefName, &bk.CreatedAt); err != nil {
			return nil, err
		}
		backups = append(backups, bk)
	}
	return backups, nil
}
