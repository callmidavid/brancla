package main

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/callmidavid/brancla/core/internal/database"
)

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#7D56F4")).
			Background(lipgloss.Color("#1E1E2E")).
			Padding(0, 1)

	subTitleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#A6ADC8")).
			Italic(true)

	safeStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#A6E3A1")).
			Bold(true)

	warningStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F9E2AF")).
			Bold(true)

	protectedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#89B4FA")).
			Bold(true)

	selectedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F5E0DC")).
			Background(lipgloss.Color("#45475A")).
			Bold(true)
)

type tuiModel struct {
	repoPath string
	branches []database.BranchRecord
	cursor   int
	selected map[int]bool
	quitting bool
	deleted  bool
}

func initialTUIModel(repoPath string, branches []database.BranchRecord) tuiModel {
	sel := make(map[int]bool)
	// Auto-select safe to delete branches
	for i, b := range branches {
		if b.SafetyStatus == "SAFE_TO_DELETE" || b.SafetyStatus == "SAFE_SQUASH_MERGED" {
			sel[i] = true
		}
	}
	return tuiModel{
		repoPath: repoPath,
		branches: branches,
		cursor:   0,
		selected: sel,
	}
}

func (m tuiModel) Init() tea.Cmd {
	return nil
}

func (m tuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			m.quitting = true
			return m, tea.Quit
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.cursor < len(m.branches)-1 {
				m.cursor++
			}
		case " ":
			// Toggle selection if not protected/current
			b := m.branches[m.cursor]
			if b.SafetyStatus != "PROTECTED" && b.SafetyStatus != "CURRENT" {
				m.selected[m.cursor] = !m.selected[m.cursor]
			}
		case "enter", "d":
			m.deleted = true
			return m, tea.Quit
		case "a":
			// Toggle all safe
			allSelected := true
			for i, b := range m.branches {
				if (b.SafetyStatus == "SAFE_TO_DELETE" || b.SafetyStatus == "SAFE_SQUASH_MERGED") && !m.selected[i] {
					allSelected = false
					break
				}
			}
			for i, b := range m.branches {
				if b.SafetyStatus == "SAFE_TO_DELETE" || b.SafetyStatus == "SAFE_SQUASH_MERGED" {
					m.selected[i] = !allSelected
				}
			}
		}
	}
	return m, nil
}

func (m tuiModel) View() string {
	if m.quitting {
		return "Operation cancelled.\n"
	}

	s := titleStyle.Render(" 🧹 Brancla - Interactive Dead Branch Sweeper ") + "\n"
	s += subTitleStyle.Render(" Repository: "+m.repoPath) + "\n\n"
	s += " Use [↑/↓] or [k/j] to navigate, [Space] to toggle, [a] to select all safe, [Enter] or [d] to delete selected, [q] to quit.\n\n"

	for i, b := range m.branches {
		cursor := " "
		if m.cursor == i {
			cursor = "❯"
		}

		checked := " [ ] "
		if m.selected[i] {
			checked = " [✓] "
		}

		statusBadge := ""
		switch b.SafetyStatus {
		case "SAFE_TO_DELETE", "SAFE_SQUASH_MERGED":
			statusBadge = safeStyle.Render("🟢 SAFE")
		case "WARNING_UNMERGED", "WARNING_CLOSED_PR":
			statusBadge = warningStyle.Render("⚠️ WARNING")
		case "PROTECTED":
			statusBadge = protectedStyle.Render("🔒 PROTECTED")
			checked = " [-] "
		case "CURRENT":
			statusBadge = protectedStyle.Render("⭐ ACTIVE")
			checked = " [-] "
		default:
			statusBadge = warningStyle.Render("❓ UNKNOWN")
		}

		prText := ""
		if b.PRNumber > 0 {
			prText = fmt.Sprintf(" (#%d %s)", b.PRNumber, b.PRState)
		}

		line := fmt.Sprintf("%s%s %-25s %-14s %s %s", cursor, checked, b.Name, statusBadge, prText, subTitleStyle.Render(b.SafetyReason))

		if m.cursor == i {
			s += selectedStyle.Render(line) + "\n"
		} else {
			s += line + "\n"
		}
	}

	selCount := 0
	for _, v := range m.selected {
		if v {
			selCount++
		}
	}

	s += fmt.Sprintf("\n Selected %d branch(es) for safe removal with backup.\n", selCount)
	return s
}
