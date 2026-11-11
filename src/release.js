// CafePOS'ning joriy versiyasi GitHub'dan olinadi: dasturga o'zgarish yuklanishi bilan
// saytdagi versiya va yuklab olinadigan fayl o'zi yangilanadi.
const REPO = process.env.CAFEPOS_REPO || 'ndoston1202-glitch/cafepos';
const BRANCH = process.env.CAFEPOS_BRANCH || 'litsenziya';
const CACHE_MS = 10 * 60 * 1000;

const zipUrl = `https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip`;
const folderName = `cafepos-${BRANCH.replace(/\//g, '-')}`;

let cache = { at: 0, value: null };

/** Versiya: sana + qisqa kod (masalan 2026.11.11-4eadee1) va so'nggi o'zgarishlar ro'yxati. */
async function getRelease({ fetchImpl = fetch, now = Date.now } = {}) {
  if (cache.value && now() - cache.at < CACHE_MS) return cache.value;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${REPO}/commits?sha=${encodeURIComponent(BRANCH)}&per_page=8`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cafepos-site' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const commits = await res.json();
    if (!Array.isArray(commits) || !commits.length) throw new Error('bo\'sh javob');
    const changes = commits.map((c) => ({
      sha: String(c.sha).slice(0, 7),
      date: c.commit.committer.date,
      title: String(c.commit.message).split('\n')[0].slice(0, 200),
    }));
    const d = new Date(changes[0].date);
    const pad = (n) => String(n).padStart(2, '0');
    const value = {
      version: `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}-${changes[0].sha}`,
      date: changes[0].date,
      changes,
    };
    cache = { at: now(), value };
    return value;
  } catch (err) {
    console.error('CafePOS versiyasini olib bo\'lmadi:', err.message);
    // GitHub javob bermasa: eski ma'lumot (bo'lsa) ko'rsatiladi, yuklab olish baribir ishlaydi
    return cache.value;
  }
}

function resetCache() { cache = { at: 0, value: null }; }

module.exports = { getRelease, resetCache, zipUrl, folderName };
