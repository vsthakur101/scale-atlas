import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const c = (id: string, r: number, d: number, name: string, tone: NonNullable<SceneNode['tone']>, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, tone, 'file', { size: [1.1, 1.0], height: 14, ...extra });
const main = (extra: Partial<SceneNode> = {}) => box('main', 12, -8, 'main (shared)', 'green', 'route', { size: [1.1, 1.1], height: 16, ...extra });
const feat = (extra: Partial<SceneNode> = {}) => box('feat', 12, 8, 'feature (yours)', 'orange', 'route', { size: [1.1, 1.1], height: 16, ...extra });
const reflog = (extra: Partial<SceneNode> = {}) => db('reflog', 3, 11, 'reflog (old SHAs recoverable)', { size: [1.2, 1.2], ...extra });

const fmtN = (n: number): string => (n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-git-merge-vs-git-rebase',
  title: 'Git Merge vs Rebase: Two Ways to Integrate History',
  blurb: 'Merge joins two lines of history with a new commit; rebase replays your commits on a new base and rewrites them. What each does to the commit graph, how many conflicts you resolve, why rebasing shared branches is dangerous — and how to choose.',
  minutes: 11,
  level: 'Intermediate',
  metrics: [
    { key: 'merge', label: 'Conflict resolutions with merge', icon: 'check' },
    { key: 'rebase', label: 'Conflict resolutions with a plain rebase', icon: 'alert' },
    { key: 'squash', label: 'Resolutions after squashing first', icon: 'copy' },
    { key: 'time', label: 'Time spent resolving: merge · rebase', icon: 'timer' },
    { key: 'sha', label: 'Commits rewritten (new SHAs) by a rebase', icon: 'hash' },
  ],
  goals: [
    { text: 'The problem: your branch has diverged from main', step: 1 },
    { text: 'Merge: a join commit, history preserved', step: 2 },
    { text: 'Rebase: replay commits on a new base', step: 3 },
    { text: 'The conflict arithmetic', step: 4 },
    { text: 'The golden rule and choosing a workflow', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Commits on your feature branch', min: 1, max: 200, step: 1, default: 12, unit: '', description: 'Commits since branching from main.' },
      { key: 'touch', label: 'Share of your commits touching the conflicting code', min: 0, max: 100, step: 1, default: 40, unit: '%', description: 'Commits that modify the lines main also changed.' },
      { key: 'min', label: 'Time per conflict resolution', min: 1, max: 60, step: 1, default: 5, unit: ' min', description: 'Understand, edit, test and continue.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, Math.round(input.n ?? 12));
      const touch = Math.min(1, Math.max(0, (input.touch ?? 40) / 100));
      const min = Math.max(0.5, input.min ?? 5);
      // Merge reconciles the two tips once; rebase replays every commit, so each one that touches the contested lines can conflict again.
      const hasConflict = touch > 0;
      const merge = hasConflict ? 1 : 0;
      const rebase = Math.max(hasConflict ? 1 : 0, n * touch);
      const squash = hasConflict ? 1 : 0;
      return {
        merge: step < 2 ? { v: '—' } : { v: `${merge} (one three-way merge of the two tips)`, tone: 'good' },
        rebase: step < 4 ? { v: '—' } : { v: `${fmtN(rebase)} (${n} commits × ${(touch * 100).toFixed(0)}% touch the contested code)`, tone: rebase <= 2 ? 'good' : rebase <= 6 ? 'warn' : 'bad' },
        squash: step < 4 ? { v: '—' } : { v: `${squash} (collapse ${n} commits into one, then replay it)`, tone: 'good' },
        time: step < 4 ? { v: '—' } : { v: `${fmtN(merge * min)} min · ${fmtN(rebase * min)} min`, tone: rebase * min < 30 ? 'good' : 'warn' },
        sha: step < 3 ? { v: '—' } : { v: `${n} (every commit is recreated with a new id)`, tone: 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Diverged',
      kind: 'problem',
      title: 'Your branch and main have both moved',
      body: [
        'You branched <code>feature</code> from <code>main</code> at commit <b>B</b> and added commits F1…F12. Meanwhile teammates added M1…M30 to <code>main</code>. Git history is a <b>directed acyclic graph</b> of commits (see the Git lesson): each commit points to its parent(s), and a branch is just a movable pointer. Your branch and main now point to different tips with the shared ancestor B behind them. Before your work can land, the two lines must be <b>integrated</b>, and Git offers two fundamentally different ways: <b>merge</b> (add a commit that joins them) and <b>rebase</b> (move your commits so they sit on top of main’s tip).',
        'Both produce the same final <i>content</i> if conflicts are resolved the same way; they differ in <b>history shape</b>, <b>how often you resolve conflicts</b>, and <b>what happens to commit identities</b> — and the last is where teams get hurt. Commit ids are hashes of content <i>and</i> parents, so any change to a commit’s ancestry produces a different id.',
      ],
      scene: { nodes: [c('b', -16, 0, 'B (shared)', 'blue'), c('m1', -8, -8, 'M1…M30', 'green'), c('f1', -8, 8, 'F1…F12', 'orange'), main({ tag: pill('M30', 'route') }), feat({ tag: pill('F12', 'route') })], links: [link('b', 'm1'), link('b', 'f1'), link('m1', 'main', { style: 'dashed' }), link('f1', 'feat', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'Merge',
      kind: 'technique',
      title: 'Merge: one join commit, history preserved',
      body: [
        '<code>git merge main</code> (on your branch) finds the <b>merge base</b> B and performs a <b>three-way merge</b> of base, your tip and main’s tip, creating a new <b>merge commit</b> with <i>two parents</i>. Every existing commit keeps its id and its parent pointers; nothing is rewritten. If both sides changed the same lines you resolve the conflict <b>once</b>, in the merge commit. The history faithfully records what happened: when work was done in parallel and when it was integrated (<code>git log --graph</code> shows the diamond), and <code>git revert -m 1 &lt;merge&gt;</code> can undo a whole feature in one step.',
        'Costs: the log becomes <b>non-linear</b> and, with frequent “merge main into my branch” updates, cluttered with noise merge commits that carry no work; <code>git log</code>, <code>blame</code> and <code>bisect</code> remain correct but harder to read. <b>Fast-forward</b> merges (when main hasn’t moved) don’t create a merge commit at all, and <code>--no-ff</code> forces one to mark a feature boundary. Merge is <b>safe on shared branches</b>: it only adds commits, so anyone who already has the branch can pull the result without surprises.',
      ],
      changes: [{ text: 'New merge commit with two parents; no existing commit changes', tone: 'good' }, { text: 'Conflicts resolved once, in the merge commit', tone: 'good' }, { text: 'Graph becomes non-linear; noisy “merge main” commits', tone: 'bad' }],
      scene: { nodes: [c('b', -16, 0, 'B', 'blue'), c('m1', -8, -8, 'M1…M30', 'green'), c('f1', -8, 8, 'F1…F12', 'orange'), c('mg', 2, 0, 'Merge commit (2 parents)', 'purple', { tag: pill('resolve conflicts here, once', 'check', 'good') }), main({ tag: pill('→ merge', 'route') })], links: [link('b', 'm1'), link('b', 'f1'), link('m1', 'mg'), link('f1', 'mg'), link('mg', 'main', { style: 'dashed' })], flows: [flow(['m1', 'mg'], { kind: 'write', rate: 1.4 }), flow(['f1', 'mg'], { kind: 'write', rate: 1.4 })] },
    },
    {
      short: 'Rebase',
      kind: 'technique',
      title: 'Rebase: replay your commits on top of main',
      body: [
        '<code>git rebase main</code> takes the commits unique to your branch (F1…F12), temporarily sets them aside, moves your branch to main’s tip, and <b>replays each one in order</b> as a new commit on top (cherry-picking each diff). The result is a <b>linear history</b>: main’s 30 commits, then your 12, as if you had started the feature from the latest main. It makes <code>git log</code> clean, keeps bisect straightforward, and a fast-forward merge afterwards adds your work with no merge commit.',
        'But each replayed commit is a <b>new commit with a new SHA</b> — its parent changed, so its hash did — and the old ones are abandoned (still reachable via the <b>reflog</b> for ~90 days). Conflicts are resolved <b>per replayed commit</b>: if F3, F7 and F9 each touch the lines main also changed, Git stops three times. <code>git rebase -i</code> lets you <b>squash, reorder, edit and drop</b> commits while replaying — a powerful way to tidy a feature branch into logical commits before review. Variants: <code>git pull --rebase</code> (replay your local commits on top of fetched upstream instead of making a merge commit), and <code>--onto</code> to transplant a range of commits to a new base.',
      ],
      changes: [{ text: 'Replays each commit on main’s tip: linear history', tone: 'good' }, { text: 'Every replayed commit gets a new SHA; old ones live in the reflog', tone: 'bad' }, { text: 'Interactive rebase: squash, reorder, edit, drop', tone: 'good' }],
      concepts: [{ term: 'Rebase', def: 'Re-applying a branch’s commits one by one on a new base, creating new commits and moving the branch pointer; history is rewritten.' }],
      scene: { nodes: [c('m1', -12, -4, 'M1…M30 (main)', 'green'), c('f1', -4, -4, "F1' … F12' (new SHAs)", 'orange', { tag: pill('replayed one by one', 'refresh') }), main(), feat({ tag: pill('moved to the new tip', 'route', 'good') }), reflog({ tag: pill('old F1…F12', 'db') })], links: [link('m1', 'f1'), link('f1', 'feat'), link('f1', 'reflog', { style: 'dashed' })], flows: [flow(['m1', 'f1', 'feat'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Conflicts',
      kind: 'insight',
      title: 'The conflict arithmetic',
      body: [
        'A merge reconciles <b>two tips</b>, so the contested lines conflict at most <b>once</b>, whatever your commit count. A plain rebase replays <b>every</b> commit: each commit that touches the contested lines can conflict again, and you may resolve “the same” conflict repeatedly in slightly different forms (an early commit edits the lines, a later one edits them again). With 12 commits and 40% touching the conflicting code, the expected number of stops is <b>12 × 0.4 ≈ 4.8</b> — at 5 minutes each, <b>24 minutes versus 5</b> for a merge.',
        'Ways to reduce it: <b>rebase early and often</b> (small drift, small conflicts), <b>squash first</b> (<code>git rebase -i</code> or <code>git merge --squash</code> to one commit, which then conflicts once — at the cost of losing the incremental history), use <b><code>git rerere</code></b> (“reuse recorded resolution”: Git remembers how you resolved a conflict and applies it automatically when the same one recurs — handy when repeatedly rebasing a long-running branch), keep branches <b>short-lived</b>, and merge main in at integration time rather than hand-rolling parallel edits to the same files. <code>git rebase --abort</code> is always available if it goes wrong; <code>git reflog</code> finds the pre-rebase tip.',
      ],
      changes: [{ text: 'Merge: ≤ 1 resolution · plain rebase: ~n × share (12 × 40% ≈ 4.8)', tone: 'info' }, { text: '24 min vs 5 min at 5 min per conflict', tone: 'bad' }, { text: 'Squash first, rerere, rebase early and often, short-lived branches', tone: 'good' }],
      scene: { nodes: [c('f1', -10, -4, 'F3 · F7 · F9 touch the lines', 'orange', { tag: pill('3 stops', 'alert', 'warn') }), c('mg', 2, -4, 'Merge: 1 stop', 'purple', { tag: pill('1 stop', 'check', 'good') }), reflog({ tag: pill('rerere remembers fixes', 'db', 'good') })], links: [link('f1', 'mg', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'Choose',
      kind: 'tradeoff',
      title: 'The golden rule and choosing a workflow',
      body: [
        '<b>The golden rule of rebasing: never rebase commits that other people have based work on</b> (anything pushed to a shared branch like <code>main</code>). Rebasing rewrites those commits; teammates who already pulled the old ones now hold history that diverges from yours — their next pull creates duplicate commits or a mess of conflicts, and force-pushing over their work can <b>destroy commits</b> from the remote. Rebasing <b>your own unpushed or private feature branch</b> is safe; if you must force-push a branch others may have fetched, use <code>--force-with-lease</code> (refuses if the remote has commits you haven’t seen) and tell them.',
        'Common workflows: <b>merge commits</b> (GitHub “Create a merge commit”: faithful history, noisy), <b>rebase and merge</b> (replay your commits onto main: linear, individual commits preserved, new SHAs), <b>squash and merge</b> (one commit per PR: the cleanest main, history inside the PR lost — the most popular for trunk-based teams). Typical hygiene: <b>rebase your private branch onto main while developing</b> to keep it current and tidy, then <b>merge via PR</b> with the strategy your team chooses; never merge main into a feature branch repeatedly just to “stay updated” unless you accept the noise. Prefer whichever keeps <code>bisect</code>, <code>revert</code> and review practical for your team, and write the rule down. The figures here are expected-value estimates from the stated commit counts and conflict share.',
      ],
      changes: [{ text: 'Never rebase shared history; use --force-with-lease on your own branch', tone: 'bad' }, { text: 'Merge commit · rebase-and-merge · squash-and-merge: pick one team rule', tone: 'info' }, { text: 'Rebase privately, integrate by PR', tone: 'good' }],
      scene: { nodes: [main({ tag: pill('shared: never rewrite', 'lock', 'good') }), feat({ tag: pill('private: rebase freely', 'check') }), c('mg', 2, 0, 'PR: squash / rebase / merge', 'purple')], links: [link('feat', 'mg'), link('mg', 'main')], flows: [flow(['feat', 'mg', 'main'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Merge preserves; rebase rewrites',
      body: [
        '<b>Merge</b>: a two-parent commit, history intact, conflicts resolved once, safe for shared branches, non-linear log. <b>Rebase</b>: replays commits for a linear history with new SHAs, conflicts per replayed commit (~4.8 here), and must not touch shared history. <b>Squash</b> first, enable <b>rerere</b>, and rebase early.',
        'Pick one team convention for how PRs land, and recover mistakes with the reflog.',
      ],
      scene: { nodes: [c('b', -14, 0, 'B', 'blue'), c('m1', -6, -6, 'main', 'green'), c('f1', -6, 6, 'feature', 'orange'), c('mg', 4, 0, 'join or replay', 'purple')], links: [link('b', 'm1'), link('b', 'f1'), link('m1', 'mg'), link('f1', 'mg')], flows: [flow(['f1', 'mg'], { kind: 'write', rate: 1.4 })] },
    },
  ],
};

export default lesson;
