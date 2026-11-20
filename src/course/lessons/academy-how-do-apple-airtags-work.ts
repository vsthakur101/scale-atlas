import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const tag = (extra: Partial<SceneNode> = {}) => box('tag', -16, 0, 'Lost tracker (BLE beacon)', 'green', 'bolt', { size: [1.2, 1.2], height: 22, ...extra });
const finders = (extra: Partial<SceneNode> = {}) => crowd('finders', -8, 0, 10, 'nearby phones (finders)', extra);
const cloud = (extra: Partial<SceneNode> = {}) => db('cloud', 1, 0, 'Relay service (encrypted blobs)', { size: [1.5, 1.5], ...extra });
const owner = (extra: Partial<SceneNode> = {}) => box('owner', 11, 0, 'Owner’s phone', 'orange', 'user', { size: [1.3, 1.3], height: 26, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);

const lesson: Lesson = {
  slug: 'academy-how-do-apple-airtags-work',
  title: 'Crowd-Sourced Device Finding: Rotating Keys and Encrypted Relays',
  blurb: 'A tracker with no GPS or internet is found by strangers’ phones that relay an encrypted location the relay service can’t read — and the rotating-key design that stops the tracker itself from being used to stalk.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'finders', label: 'Chance a passing phone is a finder', icon: 'users' },
    { key: 'time', label: 'Expected time until first sighting', icon: 'clock' },
    { key: 'keys', label: 'Keys the owner must search per day', icon: 'search' },
    { key: 'batt', label: 'Battery life from advertising', icon: 'gauge' },
  ],
  goals: [
    { text: 'The problem: locate a device that has no network of its own', step: 1 },
    { text: 'Bluetooth beacons carrying a rotating public key', step: 2 },
    { text: 'Finder phones encrypt the location to that key', step: 3 },
    { text: 'The owner derives keys and decrypts the reports', step: 4 },
    { text: 'The privacy risks and anti-stalking protections', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'density', label: 'Compatible phones passing per hour', min: 0.1, max: 2000, step: 0.1, default: 60, unit: '/h', description: 'Phones within Bluetooth range per hour (very location dependent).' },
      { key: 'share', label: 'Phones taking part as finders', min: 1, max: 100, step: 1, default: 40, unit: '%', description: 'Share of passing phones with finding enabled.' },
      { key: 'rot', label: 'Public key rotates every', min: 1, max: 240, step: 1, default: 15, unit: ' min', description: 'How often the beacon changes the key it advertises.' },
      { key: 'adv', label: 'Advertising interval', min: 0.1, max: 10, step: 0.1, default: 2, unit: ' s', description: 'Time between beacon broadcasts.' },
      { key: 'ma', label: 'Average radio current', min: 1, max: 100, step: 1, default: 12, unit: ' µA', description: 'Average current including the periodic broadcast bursts.' },
      { key: 'cap', label: 'Coin-cell capacity', min: 50, max: 1000, step: 10, default: 220, unit: ' mAh', description: 'Usable battery capacity.' },
    ],
    calculate: (input, step) => {
      const density = Math.max(0.01, input.density ?? 60);
      const share = Math.min(1, Math.max(0.01, (input.share ?? 40) / 100));
      const rot = Math.max(1, input.rot ?? 15);
      const adv = Math.max(0.05, input.adv ?? 2);
      const ua = Math.max(0.1, input.ma ?? 12);
      const cap = Math.max(1, input.cap ?? 220);
      const finderRate = density * share; // finder phones per hour
      // Expected wait for the first finder (Poisson arrivals): 1 ÷ rate.
      const waitS = 3600 / finderRate;
      // The owner can derive a key for every rotation period in the window being searched.
      const keysPerDay = (24 * 60) / rot;
      const batteryH = (cap * 1000) / ua;
      return {
        finders: step < 1 ? { v: '—' } : { v: `${(share * 100).toFixed(0)}% (${finderRate.toFixed(1)} finder phones/h)`, tone: share > 0.3 ? 'good' : 'warn' },
        time: step < 2 ? { v: '—' } : { v: fmtT(waitS), tone: waitS < 600 ? 'good' : waitS < 7200 ? 'warn' : 'bad' },
        keys: step < 3 ? { v: '—' } : { v: `${fmtN(keysPerDay)} keys per day`, tone: 'good' },
        batt: step < 1 ? { v: '—' } : { v: `${(batteryH / 24 / 365).toFixed(1)} years (≈ ${fmtN((86400 / adv) * 365)} broadcasts/yr)`, tone: batteryH / 24 / 365 > 1 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'Finding something that can’t phone home',
      body: [
        'A key-ring tracker is a coin-cell-powered gadget with <b>no GPS and no internet connection</b> — adding either would kill the battery and the price. Yet the owner wants to see where it is, anywhere in the world. The trick: borrow the <b>hundreds of millions of phones</b> that already have location and a data connection, and let them quietly report any tracker they happen to pass.',
        'Two requirements pull in opposite directions. The owner must be able to find it; but <b>nobody else</b> — not the relay company, not a passer-by, not an eavesdropper — may learn where the tracker (and so its owner) is, and the tracker must not become a stalking tool. The design that satisfies both is built on rotating public keys and end-to-end encryption.',
      ],
      scene: { nodes: [tag({ tag: pill('no GPS, no internet', 'alert', 'warn') }), finders(), cloud(), owner()], links: [link('tag', 'finders', { style: 'dashed' }), link('finders', 'cloud'), link('cloud', 'owner')], flows: [flow(['finders', 'cloud', 'owner'], { rate: 1.5 })] },
    },
    {
      short: 'Beacon',
      kind: 'technique',
      title: 'A Bluetooth beacon that changes its identity',
      body: [
        'The tracker generates an <b>elliptic-curve key pair</b> and broadcasts the <b>public key</b> in a Bluetooth Low Energy advertisement every couple of seconds: roughly 43,000 broadcasts a day, a few microamps on average, a battery life measured in <b>years</b> (220 mAh ÷ 12 µA ≈ 2 years here). It has no identity beyond that key — and, crucially, it <b>rotates the key</b> on a schedule (every 15 minutes while away from its owner), deterministically from a secret it shares with the owner’s phone.',
        'Rotation matters: if the tracker broadcast one fixed id, anyone could follow that id across the city and track it — and its owner. With rotating keys, the advertisements from one tracker look like unrelated random identifiers to everyone <i>except</i> the owner, who can compute the whole sequence.',
      ],
      changes: [{ text: 'Public key in a BLE advertisement every ~2 s', tone: 'info' }, { text: 'Key rotates every ~15 min; only the owner can link them', tone: 'good' }],
      scene: { nodes: [tag({ tag: pill('broadcast: public key P₁', 'hash') }), box('air', -6, 0, 'BLE radio range ~10 m', 'teal', 'globe', { size: [1.2, 1.2], height: 12 }), finders({ tag: pill('hear P₁', 'search') })], links: [link('tag', 'air', { style: 'dashed' }), link('air', 'finders', { style: 'dashed' })], flows: [flow(['tag', 'finders'], { rate: 1.2 })] },
    },
    {
      short: 'Report',
      kind: 'technique',
      title: 'Finders encrypt the location to the beacon’s key',
      body: [
        'A participating phone that hears a beacon it doesn’t own does three things: it notes its <b>own location</b>, <b>encrypts that location to the beacon’s public key</b> (using a fresh ephemeral key — ECDH + AES), and uploads the <b>encrypted blob</b> to the relay service indexed by a <b>hash of the public key</b>. The phone owner is not told, and sees nothing; the upload is anonymous and rate-limited.',
        'The relay service stores blobs it <b>cannot decrypt</b>: only the holder of the matching <i>private</i> key can. It sees only hashes and ciphertext, so it learns neither where trackers are nor whose they are. How soon a sighting happens depends on how many finder phones pass: at 60 phones/h with 40% participating (24 finders/h) the first sighting is expected in about <b>2.5 minutes</b>; in a quiet place with 1 finder an hour, an hour.',
      ],
      changes: [{ text: 'Encrypt (location) to the beacon’s public key; upload under hash(key)', tone: 'good' }, { text: 'Relay sees ciphertext only', tone: 'good' }, { text: '24 finders/h → first sighting in ~2.5 min', tone: 'info' }],
      concepts: [{ term: 'Hybrid encryption', def: 'Encrypting data to a public key by deriving a fresh symmetric key via key agreement, so only the private-key holder can decrypt.' }],
      scene: { nodes: [finders({ tag: pill('location → encrypt(P₁)', 'lock') }), cloud({ tag: pill('stores blob under hash(P₁)', 'disk', 'good') })], links: [link('finders', 'cloud')], flows: [flow(['finders', 'cloud'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Owner',
      kind: 'technique',
      title: 'The owner derives every key and decrypts the reports',
      body: [
        'The owner’s phone shares a secret with the tracker from pairing and uses it to <b>derive the entire sequence of rotating key pairs</b> — both the public keys (to compute their hashes) and the private keys. To find the tracker it computes the hashes for the recent time window (96 keys per day at a 15-minute rotation), <b>queries the relay for blobs under those hashes</b>, and decrypts each with the matching private key to read the finder’s location and timestamp. The owner’s own device is the only place where the pieces can be joined.',
        'It’s end-to-end encryption between the finder and the owner with a dumb mailbox in the middle — the same “server sees ciphertext” pattern as encrypted messaging (see that lesson). Because the tracker has no secret that depends on the finder, the relay can also be authenticated per owner so it won’t hand blobs to arbitrary callers, and old reports expire.',
      ],
      changes: [{ text: 'Owner derives 96 key hashes per day to query', tone: 'info' }, { text: 'Only the owner can link and decrypt the reports', tone: 'good' }],
      scene: { nodes: [owner({ tag: pill('derive keys · query hashes · decrypt', 'search') }), cloud(), tag({ name: 'Shared secret from pairing', tag: pill('seed for the key sequence', 'lock') })], links: [link('owner', 'cloud', { arrow: 'both' }), link('tag', 'owner', { style: 'dashed' })], flows: [flow(['owner', 'cloud'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Stalking',
      kind: 'problem',
      title: 'The dark side: a tracker slipped into a bag',
      body: [
        'The same system can be abused: someone hides a tracker in a person’s bag or car and watches where it goes. Protections are built around <b>detecting an unknown tracker travelling with you</b>. When a tracker is away from its owner for a while, it <b>rotates its key more slowly and changes its advertised pattern</b> in a way nearby phones can recognise as “a tracker that has been moving with me”; the phone then <b>alerts</b> the person, and the tracker can <b>play a sound</b> after being separated from its owner for some hours. Detection apps on other platforms scan for the same beacons.',
        'This is an arms race: tuning how long before alerts, how often rotation changes, and how to support all platforms with an <b>industry standard</b> (a specification for detecting unwanted trackers) so a tracker from any vendor is detectable by any phone. The privacy trade-off is explicit: rotating keys prevent third-party tracking of the <i>tag’s identity</i>, but the owner-linkable design means owner-linked tracking by a bad actor needs active countermeasures. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Separated trackers advertise differently → phones alert', tone: 'good' }, { text: 'Cross-platform standard for unwanted-tracker detection', tone: 'good' }],
      scene: { nodes: [tag({ state: 'hot', tag: pill('travelling with a stranger', 'alert', 'warn') }), finders({ name: 'Your phone', tag: pill('“unknown tracker nearby” alert', 'alert', 'good') })], links: [link('tag', 'finders', { style: 'dashed' })], flows: [flow(['tag', 'finders'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Strangers’ phones as relays, ciphertext as the contract',
      body: [
        'A battery-only tracker broadcasts a <b>rotating public key</b> over BLE; any participating phone that hears it <b>encrypts its location to that key</b> and uploads it under a hash; the relay stores ciphertext it cannot read; the owner <b>derives the key sequence</b>, queries the hashes and decrypts. Expected time to a sighting ≈ <code>1 ÷ (phones per hour × participation)</code>; battery life = capacity ÷ average current.',
        'Rotation prevents third-party tracking, and anti-stalking alerts and cross-platform detection address misuse.',
      ],
      scene: { nodes: [tag(), finders(), cloud(), owner()], links: [link('tag', 'finders', { style: 'dashed' }), link('finders', 'cloud'), link('cloud', 'owner')], flows: [flow(['finders', 'cloud', 'owner'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
