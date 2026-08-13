package providers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"
)

type GitLabProvider struct {
	token  string
	client *http.Client
}

func NewGitLabProvider() *GitLabProvider {
	token := os.Getenv("GITLAB_TOKEN")
	if token == "" {
		token = os.Getenv("GL_TOKEN")
	}

	return &GitLabProvider{
		token: token,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

type glMRResponse struct {
	IID     int    `json:"iid"`
	Title   string `json:"title"`
	State   string `json:"state"` // merged, closed, opened
	WebURL  string `json:"web_url"`
}

func (gl *GitLabProvider) FetchMRForBranch(owner, repo, branch string) (*PRInfo, error) {
	if owner == "" || repo == "" {
		return nil, fmt.Errorf("owner or repo empty")
	}

	projectPath := url.PathEscape(owner + "/" + repo)
	apiURL := fmt.Sprintf("https://gitlab.com/api/v4/projects/%s/merge_requests?source_branch=%s", projectPath, url.QueryEscape(branch))

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Brancla-Branch-Sweeper")
	if gl.token != "" {
		req.Header.Set("PRIVATE-TOKEN", gl.token)
	}

	resp, err := gl.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gitlab api returned status %d", resp.StatusCode)
	}

	var mrs []glMRResponse
	if err := json.NewDecoder(resp.Body).Decode(&mrs); err != nil {
		return nil, err
	}

	if len(mrs) == 0 {
		return &PRInfo{State: "NONE"}, nil
	}

	latest := mrs[0]
	state := "NONE"
	switch latest.State {
	case "merged":
		state = "MERGED"
	case "closed":
		state = "CLOSED"
	case "opened":
		state = "OPEN"
	}

	return &PRInfo{
		Number: latest.IID,
		Title:  latest.Title,
		State:  state,
		URL:    latest.WebURL,
	}, nil
}
