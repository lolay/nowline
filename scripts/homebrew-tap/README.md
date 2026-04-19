# homebrew-tap seed

This directory is the initial seed for the `lolay/tap` Homebrew tap. It is **not** used from inside this repo — it lives here until someone bootstraps the external tap repo.

## Bootstrapping `lolay/tap`

1. Create a new GitHub repo named **`homebrew-tap`** under the `lolay` org (Homebrew's convention: a tap called `lolay/tap` lives at `github.com/lolay/homebrew-tap`).
2. Copy this directory into the new repo:

   ```bash
   gh repo create lolay/homebrew-tap --public --description "Homebrew tap for lolay tools"
   git clone git@github.com:lolay/homebrew-tap.git
   cp -r scripts/homebrew-tap/Formula homebrew-tap/
   cp scripts/homebrew-tap/README.md homebrew-tap/README-tap.md
   cd homebrew-tap && git add . && git commit -m "seed: nowline formula placeholder" && git push
   ```

3. Generate a fine-grained Personal Access Token (or use a deploy key) with `contents: write` access to `lolay/homebrew-tap`. Add it to the main repo's secrets as **`HOMEBREW_TAP_TOKEN`**.
4. Cut a release (tag `vX.Y.Z`) — `.github/workflows/release.yml` will rewrite `Formula/nowline.rb` in the tap with the correct version/SHA256s.

Users can then install with:

```bash
brew install lolay/tap/nowline
```

(No `brew tap lolay/tap` required; specifying the full `tap/formula` spec auto-taps.)

## Versioning

The placeholder in `Formula/nowline.rb` contains `version "0.0.0"` and all-zero SHA256s. The release workflow always overwrites the file on every tag push, so the placeholder is only used until the first release.
