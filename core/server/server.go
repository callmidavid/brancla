package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/callmidavid/brancla/core/internal/engine"
)

type Server struct {
	eng  *engine.Engine
	port int
}

func NewServer(eng *engine.Engine, port int) *Server {
	if port == 0 {
		port = 47382
	}
	return &Server{
		eng:  eng,
		port: port,
	}
}

func (s *Server) Start() error {
	if daemonRunning(s.port) {
		fmt.Printf("✅ Brancla daemon already running on port %d. Reusing it.\n", s.port)
		return nil
	}

	mux := http.NewServeMux()

	// CORS Middleware wrapper
	corsHandler := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			h(w, r)
		}
	}

	mux.HandleFunc("/api/status", corsHandler(s.handleStatus))
	mux.HandleFunc("/api/repos", corsHandler(s.handleRepos))
	mux.HandleFunc("/api/scan", corsHandler(s.handleScan))
	mux.HandleFunc("/api/branches", corsHandler(s.handleBranches))
	mux.HandleFunc("/api/delete", corsHandler(s.handleDelete))
	mux.HandleFunc("/api/restore", corsHandler(s.handleRestore))
	mux.HandleFunc("/api/backups", corsHandler(s.handleBackups))

	// Write server info file so VS Code extension and Desktop App can auto-discover port
	s.writePortInfo()

	addr := fmt.Sprintf("127.0.0.1:%d", s.port)
	fmt.Printf("🚀 Brancla Daemon REST API listening on http://%s\n", addr)
	return http.ListenAndServe(addr, mux)
}

func daemonRunning(port int) bool {
	client := &http.Client{Timeout: 300 * time.Millisecond}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/api/status", port))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func (s *Server) writePortInfo() {
	home, err := os.UserHomeDir()
	if err == nil {
		infoDir := filepath.Join(home, ".brancla")
		_ = os.MkdirAll(infoDir, 0755)
		infoPath := filepath.Join(infoDir, "server.json")
		data, _ := json.MarshalIndent(map[string]interface{}{
			"port": s.port,
			"url":  fmt.Sprintf("http://127.0.0.1:%d", s.port),
		}, "", "  ")
		_ = os.WriteFile(infoPath, data, 0644)
	}
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"service": "brancla-daemon",
		"version": "1.0.0",
	})
}

func (s *Server) handleRepos(w http.ResponseWriter, r *http.Request) {
	repos, err := s.eng.GetDB().ListRepositories()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, repos)
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
		jsonError(w, http.StatusBadRequest, "Invalid request body, path required")
		return
	}

	repo, branches, err := s.eng.ScanRepository(req.Path)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"repository": repo,
		"branches":   branches,
		"count":      len(branches),
	})
}

func (s *Server) handleBranches(w http.ResponseWriter, r *http.Request) {
	repoPath := r.URL.Query().Get("repo")
	if repoPath == "" {
		jsonError(w, http.StatusBadRequest, "repo query parameter required")
		return
	}

	repo, err := s.eng.GetDB().GetRepository(repoPath)
	if err != nil {
		// Try scanning if not found
		var scanErr error
		repo, _, scanErr = s.eng.ScanRepository(repoPath)
		if scanErr != nil {
			jsonError(w, http.StatusNotFound, "Repository not found or scan failed: "+scanErr.Error())
			return
		}
	}

	branches, err := s.eng.GetDB().GetBranches(repo.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"repository": repo,
		"branches":   branches,
	})
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Path     string   `json:"path"`
		Branches []string `json:"branches"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Branches) == 0 {
		jsonError(w, http.StatusBadRequest, "Invalid request body, path and branches required")
		return
	}

	deleted, errs := s.eng.DeleteBranches(req.Path, req.Branches)

	errMsgs := make(map[string]string)
	for k, v := range errs {
		errMsgs[k] = v.Error()
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"deleted": deleted,
		"errors":  errMsgs,
	})
}

func (s *Server) handleRestore(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Path   string `json:"path"`
		Branch string `json:"branch"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Branch == "" {
		jsonError(w, http.StatusBadRequest, "Invalid request body, path and branch required")
		return
	}

	if err := s.eng.RestoreBranch(req.Path, req.Branch); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Branch '%s' restored successfully", req.Branch),
	})
}

func (s *Server) handleBackups(w http.ResponseWriter, r *http.Request) {
	repoPath := r.URL.Query().Get("repo")
	if repoPath == "" {
		jsonError(w, http.StatusBadRequest, "repo query parameter required")
		return
	}

	backups, err := s.eng.GetDB().ListBackups(repoPath)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, backups)
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}
