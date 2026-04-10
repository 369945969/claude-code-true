#!/usr/bin/env bash
#
# Claude Code Best (CCB) - Cross-platform Installation Script
# Supports: macOS, Linux, Windows (Git Bash/WSL)
#
# Usage:
#   ./install.sh              # Install from current local source tree (default)
#   ./install.sh --dev        # Install in development mode
#   ./install.sh --force      # Force re-installation
#   ./install.sh --local      # (Same as default) Install from current local source tree
#   ./install.sh --uninstall  # Uninstall existing installation
#   ./install.sh --help       # Show help
#
# Environment Variables:
#   CCB_INSTALL_DIR   - Installation directory (default: ~/.ccb)
#   CCB_VERSION       - Version to install (default: latest)
#   HTTP_PROXY        - HTTP proxy
#   HTTPS_PROXY       - HTTPS proxy
#   RIPGREP_DOWNLOAD_BASE - Mirror for ripgrep binary
#

set -e

# --- Configuration ---

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="claude-code-best"
EXECUTABLE_NAME="ccb"
REPO_URL="https://github.com/claude-code-best/claude-code.git"

# Default installation directory
DEFAULT_INSTALL_DIR="${HOME}/.ccb"
INSTALL_DIR="${CCB_INSTALL_DIR:-${DEFAULT_INSTALL_DIR}}"

# Version (empty = latest from repo)
VERSION="${CCB_VERSION:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Utility Functions ---

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# --- Platform Detection ---

detect_platform() {
    case "$(uname -s)" in
        Darwin)
            echo "darwin"
            ;;
        Linux)
            echo "linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "win32"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64)
            echo "x64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

PLATFORM=$(detect_platform)
ARCH=$(detect_arch)

# --- Prerequisites Check ---

check_prerequisites() {
    log_step "Checking prerequisites..."

    local missing=0

    # Check for git
    if ! command -v git &> /dev/null; then
        log_error "git is not installed. Please install git first."
        missing=1
    fi

    # Check for Bun (preferred)
    local has_bun=0
    if command -v bun &> /dev/null; then
        has_bun=1
        local bun_version=$(bun --version 2>/dev/null || echo "unknown")
        log_info "Bun found: v${bun_version}"
    else
        log_warn "Bun is not installed. Installing Bun..."
        if [ "$PLATFORM" = "win32" ]; then
            powershell -c "irm bun.sh/install.ps1 | iex"
        else
            curl -fsSL https://bun.sh/install | bash
        fi
        # Reload PATH
        if [ -f "$HOME/.bun/bin/bun" ]; then
            export PATH="$HOME/.bun/bin:$PATH"
        fi
        has_bun=1
    fi

    # Fallback to Node.js if Bun installation failed
    if [ "$has_bun" -eq 0 ]; then
        if command -v node &> /dev/null && command -v npm &> /dev/null; then
            log_warn "Using Node.js/npm instead of Bun (some features may be limited)"
            USE_NPM=1
        else
            log_error "Neither Bun nor Node.js/npm is installed."
            log_error "Please install Bun from https://bun.sh or Node.js from https://nodejs.org"
            missing=1
        fi
    fi

    # Check for curl (needed for downloads)
    if ! command -v curl &> /dev/null; then
        log_warn "curl is not installed. Some features may be limited."
    fi

    if [ "$missing" -eq 1 ]; then
        log_error "Please install the missing prerequisites and run again."
        exit 1
    fi

    log_info "Prerequisites check passed."
}

# --- Installation Functions ---

install_from_source() {
    local install_mode="$1"  # "dev" or "release"

    log_step "Installing ${PROJECT_NAME} from source..."

    # Create installation directory
    mkdir -p "${INSTALL_DIR}"
    cd "${INSTALL_DIR}"

    # Check if already installed
    if [ -d "${PROJECT_NAME}" ]; then
        if [ "$FORCE" = "1" ]; then
            log_warn "Removing existing installation..."
            rm -rf "${PROJECT_NAME}"
        else
            log_warn "${PROJECT_NAME} is already installed at ${INSTALL_DIR}"
            log_info "Use --force to reinstall"
            return 0
        fi
    fi

    # Clone repository
    log_step "Cloning repository..."
    if [ -n "${VERSION}" ]; then
        git clone --depth 1 --branch "${VERSION}" "${REPO_URL}" "${PROJECT_NAME}"
    else
        git clone --depth 1 "${REPO_URL}" "${PROJECT_NAME}"
    fi

    cd "${PROJECT_NAME}"

    # Install dependencies
    if [ "$USE_NPM" = "1" ]; then
        log_step "Installing dependencies with npm..."
        npm install
    else
        log_step "Installing dependencies with bun..."
        bun install
    fi

    # Build the project (for release mode)
    if [ "$install_mode" = "release" ]; then
        log_step "Building project..."
        if [ "$USE_NPM" = "1" ]; then
            npm run build
        else
            bun run build
        fi
    fi

    # Create symlink
    log_step "Creating symlink..."
    local bin_dir="${INSTALL_DIR}/bin"
    mkdir -p "${bin_dir}"

    if [ "$PLATFORM" = "win32" ]; then
        # Windows: copy executable
        if [ -d "${INSTALL_DIR}/${PROJECT_NAME}/dist" ]; then
            cp "${INSTALL_DIR}/${PROJECT_NAME}/dist/cli.js" "${bin_dir}/${EXECUTABLE_NAME}.js"
        else
            cp "${INSTALL_DIR}/${PROJECT_NAME}/src/entrypoints/cli.tsx" "${bin_dir}/${EXECUTABLE_NAME}.tsx"
        fi
    else
        # macOS/Linux: create wrapper script
        if [ -d "${INSTALL_DIR}/${PROJECT_NAME}/dist" ]; then
            cat > "${bin_dir}/${EXECUTABLE_NAME}" << EOF
#!/usr/bin/env bun
exec bun run "${INSTALL_DIR}/${PROJECT_NAME}/dist/cli.js" "\$@"
EOF
        else
            cat > "${bin_dir}/${EXECUTABLE_NAME}" << EOF
#!/usr/bin/env bun
exec bun run "${INSTALL_DIR}/${PROJECT_NAME}/src/entrypoints/cli.tsx" "\$@"
EOF
        fi
        chmod +x "${bin_dir}/${EXECUTABLE_NAME}"
    fi

    # Add to PATH if not already present
    local shell_config=""
    case "$SHELL" in
        */zsh)
            shell_config="${HOME}/.zshrc"
            ;;
        */bash)
            if [ "$PLATFORM" = "darwin" ] || [ "$PLATFORM" = "linux" ]; then
                shell_config="${HOME}/.bashrc"
                if [ ! -f "$shell_config" ]; then
                    shell_config="${HOME}/.bash_profile"
                fi
            else
                shell_config="${HOME}/.bash_profile"
            fi
            ;;
    esac

    if [ -n "$shell_config" ]; then
        if ! grep -q "${bin_dir}" "$shell_config" 2>/dev/null; then
            log_step "Adding ${bin_dir} to PATH in ${shell_config}..."
            echo "" >> "$shell_config"
            echo "# Claude Code Best bin" >> "$shell_config"
            echo "export PATH=\"${bin_dir}:\$PATH\"" >> "$shell_config"
            log_info "Added to PATH. Run 'source ${shell_config}' or restart your terminal."
        fi
    fi

    log_info "Installation complete!"
    log_info "Installation directory: ${INSTALL_DIR}/${PROJECT_NAME}"
    log_info "Executable: ${bin_dir}/${EXECUTABLE_NAME}"
    log_info ""
    log_info "To start using ${PROJECT_NAME}:"
    log_info "  ${bin_dir}/${EXECUTABLE_NAME}"
    log_info ""
    log_info "Or add '${bin_dir}' to your PATH and run:"
    log_info "  ${EXECUTABLE_NAME}"
}

install_from_local() {
    local install_mode="$1"  # "dev" or "release"

    log_step "Installing ${PROJECT_NAME} from local source..."
    log_info "Local source: ${SCRIPT_DIR}"

    mkdir -p "${INSTALL_DIR}"

    cd "${SCRIPT_DIR}"

    if [ "$USE_NPM" = "1" ]; then
        log_step "Installing dependencies with npm..."
        npm install
    else
        log_step "Installing dependencies with bun..."
        bun install
    fi

    if [ "$install_mode" = "release" ]; then
        log_step "Building project..."
        if [ "$USE_NPM" = "1" ]; then
            npm run build
        else
            bun run build
        fi
    fi

    log_step "Creating symlink..."
    local bin_dir="${INSTALL_DIR}/bin"
    mkdir -p "${bin_dir}"

    if [ "$PLATFORM" = "win32" ]; then
        log_error "--local is not supported on win32 in this installer."
        exit 1
    fi

    if [ "$install_mode" = "release" ]; then
        cat > "${bin_dir}/${EXECUTABLE_NAME}" << EOF
#!/usr/bin/env bash
set -euo pipefail
cd "${SCRIPT_DIR}"
exec bun run "${SCRIPT_DIR}/dist/cli.js" "\$@"
EOF
    else
        cat > "${bin_dir}/${EXECUTABLE_NAME}" << EOF
#!/usr/bin/env bash
set -euo pipefail
cd "${SCRIPT_DIR}"
exec bun run "${SCRIPT_DIR}/scripts/dev.ts" "\$@"
EOF
    fi
    chmod +x "${bin_dir}/${EXECUTABLE_NAME}"

    local shell_config=""
    case "$SHELL" in
        */zsh)
            shell_config="${HOME}/.zshrc"
            ;;
        */bash)
            if [ "$PLATFORM" = "darwin" ] || [ "$PLATFORM" = "linux" ]; then
                shell_config="${HOME}/.bashrc"
                if [ ! -f "$shell_config" ]; then
                    shell_config="${HOME}/.bash_profile"
                fi
            else
                shell_config="${HOME}/.bash_profile"
            fi
            ;;
    esac

    if [ -n "$shell_config" ]; then
        if ! grep -q "${bin_dir}" "$shell_config" 2>/dev/null; then
            log_step "Adding ${bin_dir} to PATH in ${shell_config}..."
            echo "" >> "$shell_config"
            echo "# Claude Code Best bin" >> "$shell_config"
            echo "export PATH=\"${bin_dir}:\$PATH\"" >> "$shell_config"
            log_info "Added to PATH. Run 'source ${shell_config}' or restart your terminal."
        fi
    fi

    log_info "Installation complete!"
    log_info "Executable: ${bin_dir}/${EXECUTABLE_NAME}"
}

install_standalone() {
    # Standalone installation (downloads pre-built binary if available)
    log_step "Installing standalone version..."

    mkdir -p "${INSTALL_DIR}"
    cd "${INSTALL_DIR}"

    local bin_dir="${INSTALL_DIR}/bin"
    mkdir -p "${bin_dir}"

    # Download pre-built binary (if available)
    local binary_name="${EXECUTABLE_NAME}"
    if [ "$PLATFORM" = "win32" ]; then
        binary_name="${EXECUTABLE_NAME}.exe"
    fi

    # For now, fall back to source installation
    log_warn "Standalone binary not available for ${PLATFORM}/${ARCH}"
    log_info "Falling back to source installation..."
    install_from_source "release"
}

# --- Post-installation ---

post_install() {
    log_step "Running post-installation..."

    # Trust the package (for bun)
    if [ "$USE_NPM" != "1" ] && command -v bun &> /dev/null; then
        cd "${INSTALL_DIR}/${PROJECT_NAME}" 2>/dev/null && bun pm trust claude-code-best 2>/dev/null || true
    fi

    log_info "Post-installation complete."
}

uninstall_existing() {
    log_step "Uninstalling ${PROJECT_NAME}..."

    local project_dir="${INSTALL_DIR}/${PROJECT_NAME}"
    local bin_dir="${INSTALL_DIR}/bin"
    local exe_path="${bin_dir}/${EXECUTABLE_NAME}"

    if [ -e "${exe_path}" ] || [ -d "${project_dir}" ] || [ -d "${bin_dir}" ]; then
        rm -rf "${project_dir}" || true
        rm -f "${exe_path}" || true
        if [ -d "${bin_dir}" ] && [ -z "$(ls -A "${bin_dir}" 2>/dev/null)" ]; then
            rmdir "${bin_dir}" 2>/dev/null || true
        fi
        if [ -d "${INSTALL_DIR}" ] && [ -z "$(ls -A "${INSTALL_DIR}" 2>/dev/null)" ]; then
            rmdir "${INSTALL_DIR}" 2>/dev/null || true
        fi
        log_info "Uninstalled from ${INSTALL_DIR}"
        return 0
    fi

    log_warn "No installation found at ${INSTALL_DIR}"
    return 0
}

# --- Help ---

show_help() {
    cat << EOF
${PROJECT_NAME} Installation Script

Usage: ./install.sh [OPTIONS]

Options:
  --dev       Install in development mode (no build)
  --release   Install release version (with build, default)
  --force     Force re-installation
  --local     Install from current local source tree (default)
  --uninstall Uninstall existing installation
  --standalone  Install standalone binary (if available)
  --help      Show this help message

Environment Variables:
  CCB_INSTALL_DIR   Installation directory (default: ~/.ccb)
  CCB_VERSION       Version to install (default: latest)
  HTTP_PROXY        HTTP proxy
  HTTPS_PROXY       HTTPS proxy

Examples:
  ./install.sh              # Install latest release
  ./install.sh --dev        # Install for development
  ./install.sh --force      # Reinstall
  CCB_VERSION=1.0.0 ./install.sh  # Install specific version

EOF
}

# --- Main ---

main() {
    local install_mode="release"
    local standalone=0
    local local_install=1
    local uninstall_only=0
    FORCE=0

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dev)
                install_mode="dev"
                shift
                ;;
            --release)
                install_mode="release"
                shift
                ;;
            --force)
                FORCE=1
                shift
                ;;
            --standalone)
                standalone=1
                shift
                ;;
            --local)
                local_install=1
                shift
                ;;
            --uninstall)
                uninstall_only=1
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    echo ""
    log_info "=========================================="
    log_info "  ${PROJECT_NAME} Installation"
    log_info "=========================================="
    echo ""
    log_info "Platform: ${PLATFORM}"
    log_info "Architecture: ${ARCH}"
    log_info "Install Directory: ${INSTALL_DIR}"
    log_info "Install Mode: ${install_mode}"
    echo ""

    # Check prerequisites
    check_prerequisites

    if [ "$uninstall_only" -eq 1 ]; then
        uninstall_existing
        return 0
    fi

    # Install
    if [ "$standalone" -eq 1 ]; then
        install_standalone
    else
        install_from_local "${install_mode}"
    fi

    # Post-install
    post_install

    echo ""
    log_info "=========================================="
    log_info "  Installation Complete!"
    log_info "=========================================="
    echo ""
}

# Run main
main "$@"
