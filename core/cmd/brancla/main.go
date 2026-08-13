package main

import (
	"fmt"
	"os"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
	"github.com/callmidavid/brancla/core/internal/database"
	"github.com/callmidavid/brancla/core/internal/engine"
	"github.com/callmidavid/brancla/core/server"
)

func main() {
	db, err := database.InitDB()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing DB: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	eng := engine.NewEngine(db)

	var rootCmd = &cobra.Command{
		Use:   "brancla [path]",
		Short: "Brancla: Safe local Git dead branch sweeper synced with GitHub & GitLab",
		Run: func(cmd *cobra.Command, args []string) {
			path := "."
			if len(args) > 0 {
				path = args[0]
			}
			runInteractive(eng, path)
		},
	}

	var interactiveFlag bool
	var safeOnlyFlag bool
	var dryRunFlag bool

	var scanCmd = &cobra.Command{
		Use:   "scan [path]",
		Short: "Scan repository and sync branch PR statuses from GitHub/GitLab",
		Run: func(cmd *cobra.Command, args []string) {
			path := "."
			if len(args) > 0 {
				path = args[0]
			}
			repo, branches, err := eng.ScanRepository(path)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error scanning repo: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("✅ Scanned %s (%d branches found)\n", repo.Name, len(branches))
			for _, b := range branches {
				fmt.Printf(" - %-25s | Status: %-18s | PR: %-8s | Reason: %s\n", b.Name, b.SafetyStatus, b.PRState, b.SafetyReason)
			}
		},
	}

	var listCmd = &cobra.Command{
		Use:   "list [path]",
		Short: "List tracked branches and their safety scores",
		Run: func(cmd *cobra.Command, args []string) {
			path := "."
			if len(args) > 0 {
				path = args[0]
			}
			repo, branches, err := eng.ScanRepository(path)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error listing branches: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("📋 Repository: %s [%s]\n\n", repo.Name, repo.Path)
			for _, b := range branches {
				fmt.Printf("[%3d%%] %-25s %-18s %s\n", b.SafetyScore, b.Name, b.SafetyStatus, b.SafetyReason)
			}
		},
	}

	var cleanCmd = &cobra.Command{
		Use:   "clean [path]",
		Short: "Safely delete dead branches with automatic local backup refs",
		Run: func(cmd *cobra.Command, args []string) {
			path := "."
			if len(args) > 0 {
				path = args[0]
			}
			if interactiveFlag {
				runInteractive(eng, path)
				return
			}

			repo, branches, err := eng.ScanRepository(path)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error scanning repository: %v\n", err)
				os.Exit(1)
			}

			var toDelete []string
			for _, b := range branches {
				if b.SafetyStatus == "SAFE_TO_DELETE" || b.SafetyStatus == "SAFE_SQUASH_MERGED" {
					toDelete = append(toDelete, b.Name)
				} else if !safeOnlyFlag && b.SafetyStatus == "WARNING_CLOSED_PR" {
					toDelete = append(toDelete, b.Name)
				}
			}

			if len(toDelete) == 0 {
				fmt.Println("✨ No dead branches found! Repository is clean.")
				return
			}

			if dryRunFlag {
				fmt.Printf("🔍 [DRY RUN] Would safely delete %d branch(es):\n", len(toDelete))
				for _, name := range toDelete {
					fmt.Printf(" - %s\n", name)
				}
				return
			}

			fmt.Printf("🧹 Deleting %d dead branch(es) with backup refs...\n", len(toDelete))
			deleted, errs := eng.DeleteBranches(repo.Path, toDelete)
			for _, name := range deleted {
				fmt.Printf("  ✓ Deleted %s (Backup ref created)\n", name)
			}
			for name, err := range errs {
				fmt.Fprintf(os.Stderr, "  ✗ Failed %s: %v\n", name, err)
			}
		},
	}
	cleanCmd.Flags().BoolVarP(&interactiveFlag, "interactive", "i", false, "Launch interactive TUI selection menu")
	cleanCmd.Flags().BoolVar(&safeOnlyFlag, "safe-only", true, "Only delete 100% safe branches (PR merged or dead on remote)")
	cleanCmd.Flags().BoolVar(&dryRunFlag, "dry-run", false, "Preview branches without deleting")

	var restoreCmd = &cobra.Command{
		Use:   "restore [path] <branch>",
		Short: "Restore a deleted branch from local backup ref",
		Args:  cobra.RangeArgs(1, 2),
		Run: func(cmd *cobra.Command, args []string) {
			path := "."
			branchName := args[0]
			if len(args) == 2 {
				path = args[0]
				branchName = args[1]
			}
			absPath, _ := filepath.Abs(path)
			err := eng.RestoreBranch(absPath, branchName)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error restoring branch '%s': %v\n", branchName, err)
				os.Exit(1)
			}
			fmt.Printf("🎉 Successfully restored branch '%s'!\n", branchName)
		},
	}

	var port int
	var serverCmd = &cobra.Command{
		Use:   "server",
		Short: "Start Brancla REST API daemon for Desktop App & VS Code Extension",
		Run: func(cmd *cobra.Command, args []string) {
			srv := server.NewServer(eng, port)
			if err := srv.Start(); err != nil {
				fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
				os.Exit(1)
			}
		},
	}
	serverCmd.Flags().IntVarP(&port, "port", "p", 47382, "Daemon port to listen on")

	rootCmd.AddCommand(scanCmd, listCmd, cleanCmd, restoreCmd, serverCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func runInteractive(eng *engine.Engine, path string) {
	absPath, _ := filepath.Abs(path)
	_, branches, err := eng.ScanRepository(absPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing repository scan: %v\n", err)
		os.Exit(1)
	}

	if len(branches) == 0 {
		fmt.Println("✨ No local branches found.")
		return
	}

	model := initialTUIModel(absPath, branches)
	p := tea.NewProgram(model)
	finalModel, err := p.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error running TUI: %v\n", err)
		os.Exit(1)
	}

	if m, ok := finalModel.(tuiModel); ok && m.deleted {
		var toDelete []string
		for idx, selected := range m.selected {
			if selected && idx < len(m.branches) {
				toDelete = append(toDelete, m.branches[idx].Name)
			}
		}

		if len(toDelete) == 0 {
			fmt.Println("No branches selected.")
			return
		}

		fmt.Printf("\n🧹 Deleting %d selected branch(es)...\n", len(toDelete))
		deleted, errs := eng.DeleteBranches(absPath, toDelete)
		for _, name := range deleted {
			fmt.Printf("  ✓ Deleted %s (Backup ref created)\n", name)
		}
		for name, err := range errs {
			fmt.Fprintf(os.Stderr, "  ✗ Failed %s: %v\n", name, err)
		}
	}
}
