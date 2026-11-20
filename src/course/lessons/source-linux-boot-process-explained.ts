import type { Lesson, SceneNode } from '../../types';
import { box, disk, flow, link, pill } from '../kit';

const fw = (extra: Partial<SceneNode> = {}) => box('fw', -17, 0, 'Firmware (UEFI / BIOS)', 'purple', 'cpu', { size: [1.4, 1.4], height: 26, ...extra });
const esp = (extra: Partial<SceneNode> = {}) => disk('esp', -17, 8, 'EFI System Partition / MBR', { size: [2, 1], height: 10, tone: 'yellow', ...extra });
const loader = (extra: Partial<SceneNode> = {}) => box('loader', -9, 0, 'Bootloader (GRUB, systemd-boot)', 'orange', 'list', { size: [1.4, 1.4], height: 24, ...extra });
const kernel = (extra: Partial<SceneNode> = {}) => box('kernel', -1, 0, 'Kernel + initramfs', 'red', 'layers', { size: [1.6, 1.6], height: 32, ...extra });
const root = (extra: Partial<SceneNode> = {}) => disk('root', -1, 8, 'Root filesystem', { size: [2.2, 1], height: 12, tone: 'yellow', ...extra });
const init = (extra: Partial<SceneNode> = {}) => box('init', 8, 0, 'PID 1: systemd', 'green', 'bolt', { size: [1.5, 1.5], height: 28, ...extra });
const svc = (i: number, name: string, extra: Partial<SceneNode> = {}) => box(`s${i}`, 16, -8 + i * 5, name, 'blue', 'server', { size: [1.1, 1.1], height: 18, ...extra });

const fmtT = (s: number): string => `${s.toFixed(s < 10 ? 2 : 1)} s`;

const lesson: Lesson = {
  slug: 'source-linux-boot-process-explained',
  title: 'How Linux Boots: Firmware, Bootloader, Kernel and systemd',
  blurb: 'From power-on to a login prompt: what firmware does, how the bootloader finds a kernel, why an initramfs exists, and how systemd turns a dependency graph into a parallel start-up — with a model of where boot time goes.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'pre', label: 'Firmware + bootloader time', icon: 'timer' },
    { key: 'kern', label: 'Kernel stage (load image + initialise)', icon: 'cpu' },
    { key: 'user', label: 'Userspace start-up: serial vs parallel', icon: 'layers' },
    { key: 'total', label: 'Power-on to login (parallel vs serial)', icon: 'clock' },
  ],
  goals: [
    { text: 'Firmware: hardware init and finding a bootloader', step: 1 },
    { text: 'The bootloader: choosing and loading a kernel', step: 2 },
    { text: 'The kernel and the initramfs', step: 3 },
    { text: 'systemd: a dependency graph started in parallel', step: 4 },
    { text: 'Reading boot time and what breaks', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'fw', label: 'Firmware initialisation (POST)', min: 0.5, max: 40, step: 0.5, default: 4, unit: ' s', description: 'Hardware enumeration; server firmware can take much longer.' },
      { key: 'loader', label: 'Bootloader menu and load', min: 0, max: 10, step: 0.5, default: 1, unit: ' s', description: 'Time in the bootloader, including any menu timeout.' },
      { key: 'img', label: 'Kernel + initramfs size', min: 20, max: 400, step: 10, default: 92, unit: ' MB', description: 'Bytes read from the boot partition.' },
      { key: 'disk', label: 'Boot disk read speed', min: 20, max: 3000, step: 10, default: 200, unit: ' MB/s', description: 'Sequential read throughput.' },
      { key: 'kinit', label: 'Kernel initialisation and root mount', min: 0.5, max: 10, step: 0.5, default: 1.5, unit: ' s', description: 'Decompress, drivers, initramfs, switch to the real root.' },
      { key: 'svcs', label: 'Units to start', min: 5, max: 500, step: 5, default: 80, unit: '', description: 'Services, mounts and sockets in the boot target.' },
      { key: 'tsvc', label: 'Average unit start time', min: 0.05, max: 5, step: 0.05, default: 0.4, unit: ' s', description: 'Time for one unit to reach “started”.' },
      { key: 'depth', label: 'Longest dependency chain', min: 1, max: 60, step: 1, default: 12, unit: ' units', description: 'Units that must start strictly one after another.' },
      { key: 'cores', label: 'CPU cores available', min: 1, max: 64, step: 1, default: 4, unit: '', description: 'Parallelism limit for starting units.' },
    ],
    calculate: (input, step) => {
      const fw = Math.max(0, input.fw ?? 4);
      const loader = Math.max(0, input.loader ?? 1);
      const img = Math.max(1, input.img ?? 92);
      const disk = Math.max(1, input.disk ?? 200);
      const kinit = Math.max(0, input.kinit ?? 1.5);
      const svcs = Math.max(1, input.svcs ?? 80);
      const tsvc = Math.max(0.001, input.tsvc ?? 0.4);
      const depth = Math.max(1, Math.min(svcs, input.depth ?? 12));
      const cores = Math.max(1, input.cores ?? 4);
      const pre = fw + loader;
      const kern = img / disk + kinit;
      const serial = svcs * tsvc;
      // Parallel start-up is bounded by the critical chain and by total work ÷ cores.
      const parallel = Math.max(depth * tsvc, serial / cores);
      const bound = depth * tsvc >= serial / cores ? 'critical chain' : 'CPU';
      return {
        pre: step < 1 ? { v: '—' } : { v: fmtT(pre), tone: pre < 6 ? 'good' : 'warn' },
        kern: step < 3 ? { v: '—' } : { v: `${fmtT(kern)} (${(img / disk).toFixed(2)} s reading ${Math.round(img)} MB)`, tone: kern < 3 ? 'good' : 'warn' },
        user: step < 4 ? { v: '—' } : { v: `${fmtT(serial)} → ${fmtT(parallel)} (bound by ${bound})`, tone: parallel < serial ? 'good' : 'warn' },
        total: step < 4 ? { v: '—' } : { v: `${fmtT(pre + kern + parallel)} vs ${fmtT(pre + kern + serial)}`, tone: pre + kern + parallel < 20 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Firmware',
      kind: 'technique',
      title: 'Firmware: wake the hardware, find something to run',
      body: [
        'At power-on the CPU starts executing firmware from flash at a fixed reset address. Modern machines run <b>UEFI</b>; older ones run <b>BIOS</b>. The firmware performs <b>POST</b> (power-on self-test), initialises memory, buses and devices, then looks for a bootable program. Legacy BIOS reads the <b>first sector (the MBR, 512 bytes)</b> of the boot disk and jumps to its 446-byte stage-one loader; UEFI instead reads boot entries from <b>NVRAM</b> and loads an executable file (<code>\\EFI\\…\\grubx64.efi</code>) from the <b>EFI System Partition</b>, a FAT filesystem it can read itself.',
        'UEFI adds <b>Secure Boot</b>: each stage’s signature is verified against keys in firmware before it runs, so an unsigned or tampered bootloader is refused. This stage is controlled by hardware and vendor firmware, and on servers (many DIMMs, RAID and network cards to initialise) POST alone can take minutes; on a laptop it is a few seconds. Here: 4 s firmware + 1 s bootloader = <b>5 s</b> before Linux code runs at all.',
      ],
      changes: [{ text: 'POST, then load a bootloader from the ESP (UEFI) or MBR (BIOS)', tone: 'info' }, { text: 'Secure Boot verifies signatures stage by stage', tone: 'good' }],
      scene: { nodes: [fw({ tag: pill('POST + enumerate devices', 'cpu') }), esp({ tag: pill('\\EFI\\…\\grubx64.efi', 'file') }), loader()], links: [link('fw', 'esp'), link('fw', 'loader')], flows: [flow(['fw', 'esp'], { rate: 1.2 }), flow(['esp', 'loader'], { kind: 'handshake', rate: 1.2 })] },
    },
    {
      short: 'Bootloader',
      kind: 'technique',
      title: 'The bootloader: pick a kernel and hand over',
      body: [
        'The bootloader (GRUB 2, systemd-boot, rEFInd) has one job: <b>get a kernel into memory and jump to it</b>. It reads its configuration, optionally shows a menu (the default timeout is a classic hidden second or five), and loads two files from the boot partition — the <b>kernel image</b> (<code>vmlinuz</code>) and the <b>initramfs</b> (<code>initrd</code>) — plus a <b>command line</b> such as <code>root=UUID=… ro quiet</code> that tells the kernel where the root filesystem is.',
        'It needs its own filesystem and disk drivers to read those files before any OS exists, which is why GRUB is large and why a corrupted boot partition or a wrong UUID leaves you at a <b>grub rescue</b> prompt. Boot parameters set here (<code>init=</code>, <code>single</code>, <code>systemd.unit=rescue.target</code>) are the standard recovery lever: editing the command line for one boot is how a lost root password or broken service is repaired.',
      ],
      changes: [{ text: 'Loads vmlinuz + initramfs and passes the kernel command line', tone: 'info' }, { text: 'Edit parameters for one boot to recover a broken system', tone: 'good' }],
      scene: { nodes: [loader({ tag: pill('root=UUID=… quiet', 'list') }), esp(), kernel({ tag: pill('loaded to RAM, jump', 'bolt') })], links: [link('esp', 'loader'), link('loader', 'kernel')], flows: [flow(['esp', 'loader', 'kernel'], { rate: 1.5 })] },
    },
    {
      short: 'Kernel',
      kind: 'technique',
      title: 'The kernel and the initramfs: a temporary root',
      body: [
        'The kernel <b>decompresses itself</b>, sets up memory management, the scheduler and interrupts, brings up the other CPU cores, and initialises built-in drivers. It cannot yet read the real root filesystem — the driver for your NVMe controller, RAID, LVM or LUKS-encrypted volume may be a loadable module <i>stored on that very filesystem</i>. That chicken-and-egg problem is what the <b>initramfs</b> solves: a small compressed archive unpacked into a RAM filesystem and mounted as a temporary root.',
        'Its <code>/init</code> loads the storage and filesystem modules, assembles RAID/LVM, <b>asks for the disk-encryption passphrase</b>, finds and mounts the real root, then does <code>switch_root</code> and executes <b>PID 1</b> from it. Cost model: read 92 MB at 200 MB/s = 0.46 s, plus about 1.5 s of initialisation ≈ <b>2 s</b>. Slow disks, bloated initramfs images (every driver included) and slow device probing (large storage arrays) are what stretch this stage.',
      ],
      changes: [{ text: 'initramfs = tiny RAM root to load drivers, unlock disks, find the real root', tone: 'info' }, { text: 'switch_root, then exec PID 1', tone: 'good' }],
      concepts: [{ term: 'initramfs', def: 'An initial RAM filesystem the kernel unpacks and runs first, containing just enough tooling to mount the real root filesystem.' }],
      scene: { nodes: [kernel({ tag: pill('decompress · drivers · cores', 'cpu') }), root({ tag: pill('mounted via initramfs /init', 'check') }), init()], links: [link('kernel', 'root'), link('kernel', 'init')], flows: [flow(['kernel', 'root'], { kind: 'handshake', rate: 1.2 }), flow(['kernel', 'init'], { rate: 1.2 })] },
    },
    {
      short: 'systemd',
      kind: 'technique',
      title: 'systemd: dependencies in, parallelism out',
      body: [
        'The first userspace process, <b>PID 1</b> (<b>systemd</b> on nearly all distributions), reads <b>unit files</b> — services, mounts, sockets, timers — each declaring <code>Requires=</code>/<code>Wants=</code> (what it needs) and <code>After=</code>/<code>Before=</code> (ordering). It builds a <b>dependency graph</b> to a goal such as <code>multi-user.target</code> or <code>graphical.target</code> and starts every unit whose dependencies are met, <b>in parallel</b>. <b>Socket activation</b> lets a service be “available” (its socket is open and queues connections) before the process has finished starting, removing ordering constraints.',
        'Old SysV init ran scripts one after another. With 80 units at 0.4 s, serial start-up is <b>32 s</b>. Parallel start-up is bounded by two things: the <b>critical chain</b> (12 dependent units × 0.4 s = 4.8 s) and total work ÷ cores (32 s ÷ 4 = 8 s). So the defaults give <b>8 s</b>, CPU-bound; add cores and the 4.8 s critical chain becomes the floor. Total power-on to login: 5 + 2 + 8 ≈ <b>15 s</b> vs ~39 s serial.',
      ],
      changes: [{ text: 'Dependency graph → start everything whose prerequisites are met', tone: 'good' }, { text: 'Floor = max(critical chain, work ÷ cores)', tone: 'info' }, { text: 'Socket activation removes ordering constraints', tone: 'good' }],
      scene: { nodes: [init({ tag: pill('graph → multi-user.target', 'layers') }), svc(0, 'network'), svc(1, 'journald'), svc(2, 'sshd', { tag: pill('After=network', 'link') }), svc(3, 'app')], links: [link('init', 's0'), link('init', 's1'), link('init', 's2'), link('init', 's3')], flows: [flow(['init', 's0'], { rate: 1.5 }), flow(['init', 's1'], { rate: 1.5 }), flow(['init', 's3'], { rate: 1.2 })] },
    },
    {
      short: 'Debug',
      kind: 'insight',
      title: 'Reading boot time and what breaks',
      body: [
        '<code>systemd-analyze</code> splits the total into <b>firmware, loader, kernel, userspace</b>; <code>systemd-analyze blame</code> ranks units by start time and <code>critical-chain</code> prints the dependency path that actually determined the finish — the only chain worth optimising, since shortening a unit off it changes nothing. Typical wins: disable unused units, replace <code>Type=oneshot</code> waits with socket or timer activation, fix a unit waiting on a 90-second timeout for a missing device or network, and trim the initramfs.',
        'Failure modes by stage: no boot device found (firmware/ESP), <b>grub rescue</b> (bootloader or config), <b>kernel panic — unable to mount root fs</b> (missing driver in initramfs or wrong <code>root=</code>), and <b>emergency shell</b> from systemd (a bad <code>/etc/fstab</code> entry for a required mount: use <code>nofail</code> for optional ones). Knowing which stage printed the last message tells you which file to fix. Figures here are a first-order model, not measurements of any machine.',
      ],
      changes: [{ text: 'Optimise only the critical chain', tone: 'good' }, { text: 'Missing driver or bad fstab → panic or emergency shell', tone: 'bad' }],
      scene: { nodes: [fw({ tag: pill('4.0 s', 'timer') }), loader({ tag: pill('1.0 s', 'timer') }), kernel({ tag: pill('2.0 s', 'timer') }), init({ tag: pill('8.0 s', 'timer', 'warn') })], links: [link('fw', 'loader'), link('loader', 'kernel'), link('kernel', 'init')], flows: [flow(['fw', 'loader', 'kernel', 'init'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Each stage exists to load the next one’s prerequisites',
      body: [
        'Firmware initialises hardware and loads a bootloader (verified by Secure Boot); the bootloader loads the kernel, initramfs and command line; the kernel mounts a temporary root, unlocks and finds the real root and starts <b>PID 1</b>; systemd turns a dependency graph into a parallel start-up bounded by the critical chain and CPU.',
        'Diagnose by stage and by critical chain, and keep a recovery path (rescue target, edited command line) in your toolbox.',
      ],
      scene: { nodes: [fw(), loader(), kernel(), root(), init()], links: [link('fw', 'loader'), link('loader', 'kernel'), link('kernel', 'root'), link('kernel', 'init')], flows: [flow(['fw', 'loader', 'kernel', 'init'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
