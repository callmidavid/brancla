package providers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type PRInfo struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
	State  string `json:"state"` // MERGED, CLOSED, OPEN, NONE
	URL    string `json:"url"`
}

type GitHubProvider struct {
	token string
	client *http.Client
}

func NewGitHubProvider() *GitHubProvider {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		token = os.Getenv("GH_TOKEN")
	}

	return &GitHubProvider{
		token: token,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

type ghPRResponse struct {
	Number   int    `json:"number"`
	Title    string `json:"title"`
	State    string `json:"state"`
	HTMLURL  string `json:"html_url"`
	MergedAt *string `json:"merged_at"`
}

func (gh *GitHubProvider) FetchPRForBranch(owner, repo, branch string) (*PRInfo, error) {
	if owner == "" || repo == "" {
		return nil, fmt.Errorf("owner or repo empty")
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls?head=%s:%s&state=all", owner, repo, owner, branch)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Brancla-Branch-Sweeper")
	if gh.token != "" {
		req.Header.Set("Authorization", "token "+gh.token)
	}

	resp, err := gh.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api returned status %d", resp.StatusCode)
	}

	var prs []ghPRResponse
	if err := json.NewDecoder(resp.Body).Decode(&prs); err != nil {
		return nil, err
	}

	if len(prs) == 0 {
		return &PRInfo{State: "NONE"}, nil
	}

	// Pick the latest PR
	latest := prs[0]
	state := stringsToUpper(latest.State)
	if latest.MergedAt != nil && *latest.MergedAt != "" {
		state = "MERGED"
	}

	return &PRInfo{
		Number: latest.Number,
		Title:  latest.Title,
		State:  state,
		URL:    latest.HTMLURL,
	}, nil
}

func stringsToUpper(s string) string {
	switch s {
	case "closed":
		return "CLOSED"
	case "open":
		return "OPEN"
	case "merged":
		return "MERGED"
	default:
		return "NONE"
	}
}
