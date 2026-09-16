Repository optimization should be done in two stages: remove unused files from the current codebase, then clean large files from Git history if the repository is still oversized.

## 1. Measure where the space is used

Check the working directory and Git database separately:

```bash
du -sh .
du -sh .git
du -h -d 2 . | sort -h | tail -30
git count-objects -vH
```

Interactive disk analysis tools:

```bash
brew install ncdu     # macOS
sudo apt install ncdu # Ubuntu
ncdu .
```

If `.git` is much larger than the current files, large or deleted files remain in Git history.

## 2. Find large tracked files

Current version:

```bash
git ls-files -z | xargs -0 du -h | sort -h | tail -50
```

Entire Git history:

```bash
git rev-list --objects --all |
git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' |
awk '$1=="blob" {print $3 "\t" $4}' |
sort -n |
tail -50
```

For an easier report, use `git-sizer`:

```bash
brew install git-sizer
git-sizer --verbose
```

## 3. Identify unused files

The best tool depends on the project:

| Project                | Useful tools                                    |
| ---------------------- | ----------------------------------------------- |
| React/Next.js/Node     | `knip`, `depcheck`, `ts-prune`                  |
| Java/Spring            | IntelliJ inspections, Maven dependency analysis |
| Python                 | `vulture`, `pip-check-reqs`                     |
| Duplicate files/images | `jdupes`, `fdupes`, `czkawka`                   |
| Large folders          | `ncdu`, `du`, `git-sizer`                       |
| Image optimization     | `sharp`, `imagemin`, `squoosh-cli`              |

For React, Next.js, or TypeScript, I recommend starting with Knip:

```bash
npx knip
```

It detects potentially unused:

* Source files
* Dependencies
* Exports
* TypeScript types
* Scripts

Treat its output as a review list—dynamic imports and framework conventions can create false positives.

## 4. Remove generated and unnecessary content

Common candidates include:

* Old screenshots and design exports
* Duplicate images
* Build folders such as `dist`, `build`, `.next`, `coverage`
* Local caches
* Log and temporary files
* Archived `.zip` files
* Database dumps
* Old videos and binary installers
* Dependencies committed as `node_modules`
* Secrets and local `.env` files

Add appropriate entries to `.gitignore`, for example:

```gitignore
node_modules/
dist/
build/
.next/
coverage/
.cache/
*.log
.env
.env.local
.DS_Store
```

If a generated folder is already tracked:

```bash
git rm -r --cached node_modules
git rm -r --cached dist build coverage
git add .gitignore
git commit -m "Remove generated files from repository"
```

Do not run these commands until you confirm the folders are reproducible and not required source files.

## 5. Optimize images

First identify formats and large assets:

```bash
find . -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.gif' -o -iname '*.svg' \) -size +500k
```

Recommended approach:

* Convert photos from PNG to WebP or AVIF.
* Keep PNG for transparency-heavy graphics.
* Optimize SVG files with SVGO.
* Resize images to their maximum displayed dimensions.
* Remove embedded image metadata.
* Avoid committing multiple near-identical exports.

Examples:

```bash
npx @squoosh/cli --webp '{"quality":80}' public/images/*.jpg
npx svgo -f public/icons
```

Review visual quality before replacing originals.

## 6. Handle large files properly

For required large binary files, use Git LFS:

```bash
git lfs install
git lfs track "*.psd" "*.mp4" "*.zip"
git add .gitattributes
git add path/to/files
git commit -m "Track large assets with Git LFS"
```

Git LFS helps future commits, but merely enabling it does not remove old copies from Git history.

Consider storing large downloadable files in object storage, a CDN, or GitHub Releases instead of the repository.

## 7. Clean large files from Git history

If large files were committed previously and later deleted, use `git-filter-repo`. This rewrites commit history, so create a backup and coordinate with collaborators first.

Install it:

```bash
brew install git-filter-repo
# or
pipx install git-filter-repo
```

Remove one file from all history:

```bash
git filter-repo --path path/to/large-file.zip --invert-paths
```

Remove a folder:

```bash
git filter-repo --path old-assets/ --invert-paths
```

Remove all blobs larger than 10 MB:

```bash
git filter-repo --strip-blobs-bigger-than 10M
```

After verifying the cleaned clone:

```bash
git push --force --all
git push --force --tags
```

Important consequences:

* Commit hashes will change.
* Open pull requests may be affected.
* Every contributor should make a fresh clone.
* Protected branches may require temporary configuration changes.
* Keep a backup until validation is complete.

## 8. Optimize the local Git database

After normal file deletion:

```bash
git gc
```

After an intentional history rewrite, a more aggressive local cleanup can be used:

```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

This only optimizes local storage; it does not by itself remove unwanted files from GitHub history.

## 9. Check non-repository GitHub storage

Repository size may not be the only contributor. Review:

* GitHub Actions artifacts and caches
* Old releases and attached binaries
* Git LFS objects
* Container images in GitHub Packages
* Build outputs stored by CI
* Stale branches containing large assets

Configure short artifact retention where appropriate:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: build-output
    path: dist/
    retention-days: 7
```

## Recommended safe sequence

1. Create a backup or temporary mirror.
2. Record current repository and `.git` sizes.
3. Run `git-sizer`, `ncdu`, and the framework-specific unused-file tool.
4. Review candidates manually.
5. Update `.gitignore`.
6. Remove unused current files in a normal commit.
7. Compress or relocate necessary large assets.
8. Run the complete build and tests.
9. Rewrite history only if `.git` remains large.
10. Re-clone the repository and compare final size before declaring it complete.

For most web repositories, `ncdu + git-sizer + Knip + Squoosh/SVGO + git-filter-repo` is a strong toolset.
