# nowline monorepo Makefile
#
# The single source of truth for build / test / lint / package / publish
# command strings. Humans, local agents, cloud agents, and CI all run the
# same verbs — CI workflows call `make <target>` so a green `make ci`
# locally means the same checks CI runs (see Makefile.md for the full
# narrative reference and the workflow -> target map).
#
# Conventions (shared across every nowline-* repo):
#   - `.DEFAULT_GOAL := help`; bare `make` prints the grouped target list.
#   - Self-documenting: a `## comment` after a target shows up in `make help`;
#     a `##@ Section` line renders as a header (section-aware awk, so help
#     can never drift from the targets).
#   - Verb names are the standard set (`format`, not `fmt`).
#   - Remote-mutating targets (publish-*) sit under `##@ Danger` and refuse
#     to run without an action-specific CONFIRM_* variable (see the confirm
#     macro). CI sets that variable inline in the release/deploy workflow.
#
# Recipes are tab-indented (a Make requirement) regardless of the repo's
# space-based editor config. Recipes run under bash (SHELL below) so
# `[[ ... ]]` and `set -o pipefail` behave the same on Linux, macOS, and
# Git Bash on Windows.

SHELL := bash

.DEFAULT_GOAL := help

.PHONY: help init build build-fast test lint format typecheck ci pre-commit clean \
        lint-workflows bundle-size compile smoke deb pack vsix bump snapshot-version \
        publish-npm publish-vscode publish-cdn

# Overridable inputs for the package / guarded targets. The release and
# deploy workflows pass these in; the defaults serve a manual local run:
#   VSIX                  the .vsix to publish (CI passes the downloaded artifact path)
#   FIREBASE_PROJECT_PATH the firebase.json directory to deploy from (dev tier by default)
#   PROJECT_ID            the Firebase project id (CI passes vars.PROJECT_ID)
VSIX ?= packages/vscode-extension/dist/nowline-vscode.vsix
FIREBASE_PROJECT_PATH ?= packages/embed/firebase/dev
NPM_DIST_TAG ?= latest

# $(call confirm,VAR,what-this-touches)
#
# Friction guard for any target that pushes to a remote. Refuses to run
# unless $(VAR) is set, printing what the target would touch and how to
# proceed. CI sets the variable inline in the release/deploy workflow; a
# human or agent reaching for `make publish-*` by hand hits the guard.
confirm = @if [ -z "$($(1))" ]; then \
  printf 'Refusing to run "make %s": %s\nThis pushes to a remote. Re-run with %s=1 (CI sets this in the release/deploy workflow).\n' "$@" "$(2)" "$(1)"; \
  exit 1; \
fi

##@ Develop

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*?##/ {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2} /^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0,5)}' $(MAKEFILE_LIST)

init: ## Install workspace dependencies from the frozen lockfile
	pnpm install --frozen-lockfile

build: ## Build every package and render examples/ + tests/ to SVG
	pnpm build

build-fast: ## Build every package but skip the ~30-SVG render (inner dev loop)
	NOWLINE_SKIP_RENDER=1 pnpm build

lint: ## Static check: biome lint + format-drift + import organization (no writes)
	pnpm check

format: ## Auto-fix formatting, lint, and import order (biome check --write)
	pnpm check:fix

typecheck: ## Type-check packages that opt in (vscode-extension tsc --noEmit, etc.)
	pnpm typecheck

test: build ## Run every package's Vitest suite (build first: CLI integration tests spawn dist/)
	pnpm -r test

ci: lint typecheck build test ## Run the full pre-push gate (what CI runs)

pre-commit: ci ## Run the local gate before committing or pushing (alias of ci)

clean: ## Remove build, binary, and package artifacts (keeps node_modules)
	rm -rf dist-bin dist-deb dist-pack dist-action packages/*/dist packages/*/dist-*

lint-workflows: ## actionlint the GitHub Actions workflows (needs actionlint on PATH)
	pnpm lint:workflows

bundle-size: ## Build the embed graph and run the CDN bundle-size + node:* leak gate
	pnpm -r --filter @nowline/core --filter @nowline/layout --filter @nowline/renderer --filter @nowline/browser --filter @nowline/embed run build
	pnpm --filter @nowline/embed check-size --print-attribution

##@ Release

compile: ## [pkg] Compile standalone CLI binaries (TARGET=bun-<os>-<arch>|local, omit for all; needs Bun + a prior build)
	cd packages/cli && node scripts/compile.mjs $(if $(TARGET),--target=$(TARGET))

smoke: ## [pkg] Smoke-test a compiled binary across every export format (MATRIX_* env or host-derived)
	bash scripts/smoke-binary.sh

deb: ## [pkg] Build a .deb wrapping the compiled binary (ARCH=amd64|arm64)
	@set -euo pipefail; \
	arch="$(ARCH)"; \
	case "$$arch" in \
	  amd64) suffix=linux-x64 ;; \
	  arm64) suffix=linux-arm64 ;; \
	  *) echo "make deb: ARCH must be amd64 or arm64 (got '$$arch')" >&2; exit 2 ;; \
	esac; \
	version=$$(node -p "require('./packages/cli/package.json').version"); \
	bash scripts/build-deb.sh "$$arch" "packages/cli/dist-bin/nowline-$$suffix" "$$version"

pack: ## [pkg] Pack the publishable @nowline/* npm tarballs into dist-pack/ (dependency order)
	@set -euo pipefail; \
	mkdir -p dist-pack; \
	dest="$(CURDIR)/dist-pack"; \
	for pkg in \
	    packages/core packages/layout packages/renderer packages/browser \
	    packages/embed packages/preview-shell packages/lsp packages/lsp-worker \
	    packages/export-core packages/export-png packages/export-pdf \
	    packages/export-html packages/export-mermaid packages/export-xlsx \
	    packages/export-msproj packages/export packages/mcp packages/config packages/cli; do \
	  (cd "$$pkg" && pnpm pack --pack-destination "$$dest"); \
	done; \
	ls -la dist-pack

vsix: ## [pkg] Package the VS Code / Cursor extension into a .vsix
	cd packages/vscode-extension && pnpm package

bump: ## [pkg] Bump every package version (LEVEL=patch|minor|major); prints the new version
	@node .github/scripts/bump-version.mjs $(LEVEL)

snapshot-version: ## [pkg] Compute and write 0.0.0-dev.<ts>.g<sha> to every package.json; prints the version
	@node .github/scripts/snapshot-version.mjs

##@ Danger

publish-npm: ## [danger] Publish the @nowline/* tarballs in dist-pack/ to npmjs.com
	$(call confirm,CONFIRM_PUBLISH,Publishes @nowline/* to npmjs.com)
	@set -euo pipefail; \
	for pkg in nowline-core nowline-layout nowline-renderer nowline-browser nowline-embed nowline-preview-shell nowline-lsp nowline-lsp-worker nowline-export-core nowline-export-png nowline-export-pdf nowline-export-html nowline-export-mermaid nowline-export-xlsx nowline-export-msproj nowline-export nowline-mcp nowline-config nowline-cli; do \
	  tarball=$$(find dist-pack -maxdepth 1 -name "$${pkg}-[0-9]*.tgz" -print -quit); \
	  test -n "$$tarball" || { echo "missing tarball for $${pkg}" >&2; exit 1; }; \
	  echo "publishing $$tarball"; \
	  npm publish "./$$tarball" --access public --tag $(NPM_DIST_TAG); \
	done

publish-vscode: ## [danger] Publish the VS Code extension to the VS Code Marketplace + Open VSX
	$(call confirm,CONFIRM_PUBLISH,Publishes nowline-vscode to the VS Code Marketplace and Open VSX)
	npx --yes @vscode/vsce publish --packagePath $(VSIX)
	npx --yes ovsx publish $(VSIX) -p "$$OVSX_PAT"

publish-cdn: ## [danger] Deploy the @nowline/embed bundle to the Firebase Hosting CDN
	$(call confirm,CONFIRM_DEPLOY,Deploys the embed bundle to the Firebase Hosting CDN)
	cd $(FIREBASE_PROJECT_PATH) && firebase deploy --only hosting --project $(PROJECT_ID) --non-interactive
