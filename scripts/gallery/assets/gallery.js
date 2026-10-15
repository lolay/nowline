// Review gallery page behaviour: the previous-vs-this compare widget (side by
// side, blink, slider, pixel diff), item and build navigation, and the
// client-side range compare. Plain DOM, no framework, no network beyond the
// gallery's own files.
(() => {
    const root = document.documentElement;
    const body = document.body;

    const store = {
        get(key) {
            try {
                return localStorage.getItem(`nowline-review.${key}`);
            } catch {
                return null;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(`nowline-review.${key}`, value);
            } catch {
                // Private mode or blocked storage: preferences just don't stick.
            }
        },
    };

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        for (const [name, value] of Object.entries(attrs)) {
            if (value === null || value === undefined || value === false) continue;
            if (name === 'text') node.textContent = value;
            else if (name === 'className') node.className = value;
            else node.setAttribute(name, value === true ? '' : value);
        }
        for (const child of [].concat(children)) {
            if (child) node.append(child);
        }
        return node;
    }

    function localTime(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }

    function localizeTimes(scope) {
        for (const t of scope.querySelectorAll('time[datetime]')) {
            t.textContent = localTime(t.getAttribute('datetime'));
        }
    }

    // --- Shared preferences ------------------------------------------------

    const layouts = ['auto', 'stack', 'side'];
    const sizes = ['fit', 'actual'];
    let layout = layouts.includes(store.get('layout')) ? store.get('layout') : 'auto';
    let size = sizes.includes(store.get('size')) ? store.get('size') : 'fit';
    const widgets = [];

    function applyPrefs() {
        root.dataset.layout = layout;
        root.dataset.size = size;
        for (const w of widgets) w.refresh();
    }

    // --- Compare widget ----------------------------------------------------

    function caption(label, meta) {
        if (!meta) return el('figcaption', { text: label });
        const sha = meta.sha.slice(0, 7);
        return el('figcaption', {}, [
            el('strong', { text: `${label} ` }),
            meta.url ? el('a', { href: meta.url, text: sha }) : el('span', { text: sha }),
            el('span', { className: 'subject', text: ` ${meta.subject}` }),
            el('span', {
                className: 'byline',
                text: ` · ${meta.author} · ${localTime(meta.date)}`,
            }),
        ]);
    }

    function segmented(name, options, current, onPick) {
        const group = el('div', { className: `seg seg-${name}`, role: 'group' });
        for (const [value, label] of options) {
            const button = el('button', { type: 'button', text: label, 'data-value': value });
            button.addEventListener('click', () => onPick(value));
            group.append(button);
        }
        const mark = (value) => {
            for (const b of group.children) b.classList.toggle('on', b.dataset.value === value);
        };
        mark(current);
        return { group, mark };
    }

    function loaded(img) {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        });
    }

    function buildCompare(section) {
        const thisSrc = section.dataset.thisSrc;
        const prevSrc = section.dataset.prevSrc || '';
        const thisMeta = JSON.parse(section.dataset.thisMeta || 'null');
        const prevMeta = JSON.parse(section.dataset.prevMeta || 'null');
        section.textContent = '';

        const pane = (cls, label, src, meta) =>
            el('figure', { className: `pane ${cls}` }, [
                caption(label, meta),
                el('div', { className: 'scroll' }, [
                    el('a', { href: src }, [el('img', { src, alt: `${label} render` })]),
                ]),
            ]);
        const panes = el('div', { className: 'panes' }, [
            prevSrc ? pane('pane-prev', 'Previous', prevSrc, prevMeta) : null,
            pane('pane-this', prevSrc ? 'This build' : 'Render', thisSrc, thisMeta),
        ]);

        const toolbar = el('div', { className: 'compare-toolbar' });
        let mode = 'side';
        let stage = null;

        const sizeSeg = segmented(
            'size',
            [
                ['fit', 'Fit'],
                ['actual', 'Actual size'],
            ],
            size,
            (value) => {
                size = value;
                store.set('size', value);
                applyPrefs();
            },
        );

        let modeSeg = null;
        let layoutSeg = null;
        if (prevSrc) {
            stage = buildStage(prevSrc, thisSrc, prevMeta, thisMeta);
            modeSeg = segmented(
                'mode',
                [
                    ['side', 'Side by side'],
                    ['blink', 'Blink'],
                    ['slider', 'Slider'],
                    ['diff', 'Diff'],
                ],
                mode,
                (value) => {
                    mode = value;
                    widget.refresh();
                },
            );
            layoutSeg = segmented(
                'layout',
                [
                    ['auto', 'Auto'],
                    ['stack', 'Stack'],
                    ['side', 'Side'],
                ],
                layout,
                (value) => {
                    layout = value;
                    store.set('layout', value);
                    applyPrefs();
                },
            );
            toolbar.append(modeSeg.group, layoutSeg.group);
        }
        toolbar.append(sizeSeg.group);
        section.append(toolbar, panes);
        if (stage) section.append(stage.node);

        // In actual size the two panes scroll together, so the same timeline
        // region stays lined up.
        const scrolls = [...panes.querySelectorAll('.scroll')];
        let syncing = false;
        for (const s of scrolls) {
            s.addEventListener('scroll', () => {
                if (syncing) return;
                syncing = true;
                for (const other of scrolls) {
                    if (other !== s) {
                        other.scrollLeft = s.scrollLeft;
                        other.scrollTop = s.scrollTop;
                    }
                }
                requestAnimationFrame(() => {
                    syncing = false;
                });
            });
        }

        const widget = {
            refresh() {
                sizeSeg.mark(size);
                layoutSeg?.mark(layout);
                modeSeg?.mark(mode);
                section.dataset.mode = mode;
                panes.hidden = mode !== 'side';
                if (stage && stage.mode !== mode) stage.show(mode);
                else stage?.fit();
            },
        };
        widgets.push(widget);
        widget.refresh();
    }

    function buildStage(prevSrc, thisSrc, prevMeta, thisMeta) {
        const prevImg = el('img', {
            className: 'layer-prev',
            src: prevSrc,
            alt: 'Previous render',
        });
        const thisImg = el('img', {
            className: 'layer-this',
            src: thisSrc,
            alt: 'This build render',
        });
        const canvas = el('canvas', { className: 'layer-diff' });
        const layer = el('div', { className: 'layer' }, [prevImg, thisImg, canvas]);
        const scroller = el('div', { className: 'stage-scroll' }, [layer]);
        const label = el('div', { className: 'stage-caption' });
        const wipe = el('input', {
            type: 'range',
            min: '0',
            max: '100',
            value: '50',
            className: 'wipe',
            'aria-label': 'Wipe between previous and this build',
        });
        const node = el('div', { className: 'stage', hidden: true }, [label, scroller, wipe]);

        let mode = 'side';
        let timer = null;
        let showingPrev = false;
        let paused = false;
        let diffDone = false;
        let diffLabel = '';
        let width = 0;
        let height = 0;

        const ready = Promise.all([loaded(prevImg), loaded(thisImg)]).then(() => {
            width = Math.max(prevImg.naturalWidth, thisImg.naturalWidth) || 800;
            height = Math.max(prevImg.naturalHeight, thisImg.naturalHeight) || 400;
            layer.style.width = `${width}px`;
            layer.style.height = `${height}px`;
            fit();
        });

        function fit() {
            if (!width) return;
            if (size === 'fit') {
                const scale = Math.min(1, scroller.clientWidth / width || 1);
                layer.style.transform = `scale(${scale})`;
                scroller.style.height = `${Math.ceil(height * scale)}px`;
            } else {
                layer.style.transform = 'none';
                scroller.style.height = '';
            }
        }

        function setLabel() {
            const meta = showingPrev ? prevMeta : thisMeta;
            const which = showingPrev ? 'Previous' : 'This build';
            label.replaceChildren(
                caption(`${which}${paused ? ' (paused, tap to flip)' : ''}`, meta),
            );
        }

        function stopBlink() {
            if (timer) clearInterval(timer);
            timer = null;
        }

        function flip() {
            showingPrev = !showingPrev;
            node.classList.toggle('show-prev', showingPrev);
            setLabel();
        }

        scroller.addEventListener('click', (event) => {
            if (mode !== 'blink') return;
            event.preventDefault();
            if (!paused) {
                paused = true;
                stopBlink();
            } else {
                flip();
            }
            setLabel();
        });

        wipe.addEventListener('input', () => {
            thisImg.style.clipPath = `inset(0 0 0 ${wipe.value}%)`;
        });

        function runDiff() {
            if (diffDone) return;
            diffDone = true;
            void ready.then(() => {
                canvas.width = width;
                canvas.height = height;
                const read = (img) => {
                    const c = document.createElement('canvas');
                    c.width = width;
                    c.height = height;
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0);
                    return ctx.getImageData(0, 0, width, height);
                };
                try {
                    const a = read(prevImg);
                    const b = read(thisImg);
                    const ctx = canvas.getContext('2d');
                    const out = ctx.createImageData(width, height);
                    let changed = 0;
                    for (let i = 0; i < a.data.length; i += 4) {
                        const delta =
                            Math.abs(a.data[i] - b.data[i]) +
                            Math.abs(a.data[i + 1] - b.data[i + 1]) +
                            Math.abs(a.data[i + 2] - b.data[i + 2]);
                        if (delta > 24) {
                            changed++;
                            out.data[i] = 255;
                            out.data[i + 1] = 0;
                            out.data[i + 2] = 200;
                        } else {
                            // Faded copy of this build, so the magenta reads.
                            out.data[i] = 255 - (255 - b.data[i]) * 0.25;
                            out.data[i + 1] = 255 - (255 - b.data[i + 1]) * 0.25;
                            out.data[i + 2] = 255 - (255 - b.data[i + 2]) * 0.25;
                        }
                        out.data[i + 3] = 255;
                    }
                    ctx.putImageData(out, 0, 0);
                    const pct = ((changed / (width * height)) * 100).toFixed(2);
                    diffLabel =
                        changed === 0
                            ? 'No pixel differences (the SVG bytes differ, the picture does not)'
                            : `≈ ${changed.toLocaleString()} px changed (${pct}%), shown in magenta`;
                } catch {
                    diffLabel =
                        'Pixel diff needs the gallery served over http(s). Locally: make gallery-serve';
                }
                if (mode === 'diff') label.textContent = diffLabel;
            });
        }

        return {
            node,
            get mode() {
                return mode;
            },
            fit,
            show(next) {
                mode = next;
                node.hidden = mode === 'side';
                node.dataset.mode = mode;
                stopBlink();
                paused = false;
                showingPrev = false;
                node.classList.remove('show-prev');
                wipe.hidden = mode !== 'slider';
                thisImg.style.clipPath = mode === 'slider' ? `inset(0 0 0 ${wipe.value}%)` : '';
                if (mode === 'blink') {
                    setLabel();
                    timer = setInterval(flip, 700);
                } else if (mode === 'slider') {
                    label.textContent = 'Left: previous · Right: this build. Drag the slider.';
                } else if (mode === 'diff') {
                    label.textContent = diffDone ? diffLabel : 'Computing pixel diff…';
                    runDiff();
                }
                requestAnimationFrame(fit);
            },
        };
    }

    // --- Entry navigation --------------------------------------------------

    function setupEntryNav() {
        const bar = document.querySelector('.navbar[data-prev-all]');
        if (!bar) return;
        const params = new URLSearchParams(location.search);
        const changedTotal = Number(bar.dataset.changedTotal);
        let changedOnly =
            changedTotal > 0 &&
            (params.has('changed')
                ? params.get('changed') === '1'
                : body.dataset.hasChanges === '1');
        const box = bar.querySelector('.changed-only input');
        box.disabled = changedTotal === 0;

        const withFlag = (href) => (href ? `${href}?changed=${changedOnly ? 1 : 0}` : href);

        function apply() {
            box.checked = changedOnly;
            const prev = changedOnly ? bar.dataset.prevChanged : bar.dataset.prevAll;
            const next = changedOnly ? bar.dataset.nextChanged : bar.dataset.nextAll;
            bar.querySelector('.prev-item').href = withFlag(prev);
            bar.querySelector('.next-item').href = withFlag(next);
            for (const a of bar.querySelectorAll('.history-row a')) {
                a.href = withFlag(a.getAttribute('href').split('?')[0]);
            }
            const counter = bar.querySelector('.counter');
            if (changedOnly) {
                const ci = Number(bar.dataset.changedIndex);
                counter.textContent = `${ci >= 0 ? ci + 1 : '–'} / ${changedTotal} changed`;
            } else {
                counter.textContent = `${Number(bar.dataset.index) + 1} / ${bar.dataset.total}`;
            }
        }
        box.addEventListener('change', () => {
            changedOnly = box.checked;
            apply();
        });
        apply();

        const go = (selector) => {
            const a = bar.querySelector(selector);
            if (a?.href) location.href = a.href;
        };
        document.addEventListener('keydown', (event) => {
            if (event.target.closest?.('input, select, textarea')) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const keys = {
                ArrowLeft: 'a.prev-item',
                ArrowRight: 'a.next-item',
                '[': 'a.older-build',
                ']': 'a.newer-build',
                '{': 'a.older-change',
                '}': 'a.newer-change',
            };
            if (keys[event.key]) go(keys[event.key]);
        });

        let start = null;
        document.addEventListener(
            'touchstart',
            (event) => {
                const t = event.touches[0];
                const scrollable =
                    root.dataset.size === 'actual' ||
                    event.target.closest('.wipe, pre, .history-strip');
                start =
                    scrollable || event.touches.length > 1 ? null : { x: t.clientX, y: t.clientY };
            },
            { passive: true },
        );
        document.addEventListener(
            'touchend',
            (event) => {
                if (!start) return;
                const t = event.changedTouches[0];
                const dx = t.clientX - start.x;
                const dy = t.clientY - start.y;
                start = null;
                if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) {
                    go(dx < 0 ? 'a.next-item' : 'a.prev-item');
                }
            },
            { passive: true },
        );

        const historyRow = bar.querySelector('.history-row');
        const strip = historyRow.querySelector('.history-strip');
        fetch(historyRow.dataset.historyUrl)
            .then((response) => (response.ok ? response.json() : []))
            .then((rows) => {
                const currentId = body.dataset.buildId;
                for (const row of rows) {
                    const changed = row.status === 'changed' || row.status === 'new';
                    const dot = el('a', {
                        className: `dot${changed ? ' changed' : ''}${row.id === currentId ? ' current' : ''}`,
                        href: withFlag(`../../${row.id}/${historyRow.dataset.entryKey}.html`),
                        title: `${row.sha.slice(0, 7)} · ${localTime(row.date)} · ${row.author} · ${row.status}`,
                    });
                    strip.append(dot);
                }
                strip
                    .querySelector('.current')
                    ?.scrollIntoView({ inline: 'center', block: 'nearest' });
            })
            .catch(() => {
                // file:// can't fetch; the older/newer links still work.
            });
    }

    // --- Range compare ------------------------------------------------------

    function setupComparePage() {
        const dataNode = document.getElementById('gallery-data');
        if (!dataNode) return;
        const data = JSON.parse(dataNode.textContent);
        const params = new URLSearchParams(location.search);
        const byId = new Map(data.builds.map((b) => [b.id, b]));
        const to = byId.get(params.get('to')) ?? data.builds[0];
        const from = byId.get(params.get('from')) ?? data.builds[1] ?? data.builds[0];
        const summary = document.querySelector('.summary');
        const cards = document.querySelector('.range-cards');
        if (!to || !from) {
            summary.textContent = 'No builds to compare.';
            return;
        }
        const line = (label, b) => [
            el('strong', { text: `${label} ` }),
            b.url
                ? el('a', { href: b.url, text: b.sha.slice(0, 7) })
                : el('span', { text: b.sha.slice(0, 7) }),
            ` ${b.subject} · ${b.author} · ${localTime(b.date)}`,
        ];
        document.querySelector('.range-from').replaceChildren(...line('From', from));
        document.querySelector('.range-to').replaceChildren(...line('To', to));

        const counts = { drift: 0, edit: 0, new: 0, removed: 0, unchanged: 0 };
        const changed = [];
        for (const group of data.groups) {
            for (const key of group.keys) {
                const now = to.entries[key];
                const then = from.entries[key];
                if (!now) {
                    if (then) {
                        counts.removed++;
                        changed.push({ key, group, kind: 'removed' });
                    }
                    continue;
                }
                if (!then) {
                    counts.new++;
                    changed.push({ key, group, kind: 'new' });
                } else if (now[2] === 1) {
                    // Volatile: expected to differ.
                } else if (now[0] === then[0]) {
                    counts.unchanged++;
                } else {
                    const kind = now[1] === then[1] ? 'drift' : 'edit';
                    counts[kind]++;
                    changed.push({ key, group, kind });
                }
            }
        }
        const labels = {
            drift: 'renderer drift',
            edit: 'source edit',
            new: 'new',
            removed: 'removed',
            unchanged: 'unchanged',
        };
        summary.replaceChildren(
            ...Object.entries(counts)
                .filter(([, n]) => n > 0)
                .map(([k, n]) =>
                    el('span', { className: `chip status-${k}`, text: `${n} ${labels[k]}` }),
                ),
        );
        const order = { drift: 0, edit: 1, new: 2, removed: 3 };
        changed.sort((a, b) => order[a.kind] - order[b.kind]);
        if (changed.length === 0) {
            cards.append(
                el('p', { className: 'note', text: 'No rendered output changed in this range.' }),
            );
        }
        for (const c of changed) {
            const slug = c.key.split('/')[1];
            const target = c.kind === 'removed' ? from : to;
            const section = el('section', {
                className: 'compare',
                'data-this-src': `b/${target.id}/${c.key}.svg`,
                'data-this-meta': JSON.stringify(target),
            });
            if (c.kind === 'drift' || c.kind === 'edit') {
                section.dataset.prevSrc = `b/${from.id}/${c.key}.svg`;
                section.dataset.prevMeta = JSON.stringify(from);
            }
            cards.append(
                el('article', { className: 'card' }, [
                    el('h2', {}, [
                        el('a', { href: `b/${target.id}/${c.key}.html`, text: slug }),
                        el('span', { className: 'muted', text: ` ${c.group.title} ` }),
                        el('span', { className: `chip status-${c.kind}`, text: labels[c.kind] }),
                    ]),
                    section,
                ]),
            );
        }
    }

    // --- Site root -----------------------------------------------------------

    function setupRoot() {
        const form = document.querySelector('form.range');
        if (!form) return;
        const from = form.elements.from;
        const to = form.elements.to;
        if (from.options.length > 1) from.selectedIndex = 1;
        to.selectedIndex = 0;
        const seen = JSON.parse(store.get('lastSeen') || 'null');
        const newest = to.options[0]?.value;
        const known = seen && [...from.options].some((o) => o.value === seen.id);
        if (known && seen.id !== newest) {
            const link = document.querySelector('.since-last-visit');
            link.href = `compare.html?from=${encodeURIComponent(seen.id)}&to=${encodeURIComponent(newest)}`;
            link.hidden = false;
        }
    }

    function recordVisit() {
        const id = body.dataset.buildId;
        const date = body.dataset.buildDate;
        if (!id || !date) return;
        const seen = JSON.parse(store.get('lastSeen') || 'null');
        if (!seen || new Date(date) > new Date(seen.date)) {
            store.set('lastSeen', JSON.stringify({ id, date }));
        }
    }

    function setupCollapse() {
        const button = document.querySelector('.collapse-all');
        if (!button) return;
        button.addEventListener('click', () => {
            const collapsed = body.classList.toggle('collapsed');
            button.textContent = collapsed ? 'Expand all' : 'Collapse all';
        });
    }

    setupComparePage();
    for (const section of document.querySelectorAll('section.compare')) buildCompare(section);
    applyPrefs();
    localizeTimes(document);
    setupEntryNav();
    setupRoot();
    setupCollapse();
    recordVisit();
    window.addEventListener('resize', () => {
        for (const w of widgets) w.refresh();
    });
})();
