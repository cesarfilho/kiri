// A refresh of a Compose list with 90 rows costs what the Containers list's own refresh of 90 rows
// costs on the same machine, timed in the same run (best of 5 each), so a slow or busy runner moves
// both: an unchanged refresh draws nothing again (the same projects, the same containers: about 0.04
// times the Containers refresh), a changed one fits the columns once (about 1.1 times; the old redraw
// that fitted them again and again was 5 to 50 times). 400 ms is only a loose ceiling for either.
// A changed refresh fits the columns once; a change of type (letter spacing here) fits them again.
const R = [];
const t = (name, fn) => { try { fn(); R.push("PASS " + name); } catch (e) { R.push("FAIL " + name + ": " + e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ": got " + JSON.stringify(a) + " want " + JSON.stringify(b)); };
const svc = (name, i) => ({ name, image: `registry.example.com/team/${name}:2026.11.16`, build: "", ports: [`${18000 + i}:80`], volumes: [], depends: [], networks: ["default"], kinds: [] });
const mk = (status, updated = 1) => Array.from({ length: 30 }, (_, p) => {
  const names = [`notification-delivery-worker-${p}`, `payments-reconciliation-service-${p}`];
  return { name: `customer-analytics-and-reporting-platform-${p}`, dir: `/w/p${p}`, files: [`/w/p${p}/compose.yaml`], readable: true, updated, services: names.map((n, i) => svc(n, p * 2 + i)),
    containers: names.map((n, i) => ({ service: n, id: `c${p}-${i}`, name: `project-number-${p}-${n}-1`, image: n, state: i ? "running" : "exited", status })) };
});
const lists = (projects, status) => ({ type: "lists", containers: projects.flatMap((p) => p.containers.map((c) => ({ Id: c.id, Names: ["/" + c.name], Image: c.image, State: c.state, Status: status, Created: 1, Ports: [], Labels: { "com.docker.compose.project": p.name, "com.docker.compose.service": c.service } }))), images: [], volumes: [], networks: [] });
// Best of n, after one to warm up: the least a run takes, what the machine can do when nothing else runs.
const best = (fn, n = 5) => { fn(); let b = Infinity; for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); b = Math.min(b, performance.now() - t0); } return b; };
const CEILING = 400;
ui.vm = "running";
// The machine's measure: the Containers list, 90 rows of the same length, each refresh with a new status.
const plain = (status) => ({ type: "lists", containers: Array.from({ length: 90 }, (_, i) => ({ Id: `p${i}`, Names: [`/project-number-${i}-notification-delivery-worker-1`],
  Image: `registry.example.com/team/payments-reconciliation-service-${i}:2026.11.16`, State: i % 2 ? "running" : "exited", Status: status, Created: 1,
  Ports: [{ PublicPort: 18000 + i, PrivatePort: 80, Type: "tcp" }], Labels: {} })), images: [], volumes: [], networks: [] });
kiri.on(plain("Up 1 minute"));
show("containers");
const plainRows = document.querySelectorAll("#content table tbody tr").length;
let j = 0;
const base = best(() => { j++; kiri.on(plain(`Up ${j} minutes`)); render(); });
const within = (ms, times) => { if (ms > base * times || ms > CEILING) throw new Error(`${ms.toFixed(1)} ms, the Containers list's ${base.toFixed(1)} ms (at most ${times} times, and ${CEILING} ms)`); };
t("the Containers list measured with 90 rows", () => eq(plainRows, 90, "rows"));
kiri.on(lists(mk("Up"), "Up"));
kiri.on({ type: "composeprojects", logos: {}, projects: mk("Up") });
show("compose");
t("an unchanged refresh of 90 rows: both events under half the Containers list's refresh, the rows left as they are", () => {
  const rows = document.querySelectorAll("table.clist tbody tr").length;
  if (rows < 90) throw new Error(`${rows} rows`);
  const first = document.querySelector("table.clist tbody tr");
  within(best(() => { kiri.on(lists(mk("Up"), "Up")); kiri.on({ type: "composeprojects", logos: {}, projects: mk("Up") }); }), 0.5);
  eq(document.querySelector("table.clist tbody tr") === first, true, "the same rows");
});
t("a changed refresh of 90 rows: under twice the Containers list's refresh, the columns fitted once, and it shows", () => {
  let k = 0;
  const changed = () => { k++; render(); kiri.on({ type: "composeprojects", logos: {}, projects: mk("Up", Math.floor(Date.now() / 1000) - k * 3600) }); render(); };
  within(best(changed), 2);
  let fits = 0; const fit = fitColumns; fitColumns = () => { fits++; fit(); };
  try { changed(); } finally { fitColumns = fit; }
  eq(fits, 1, "fits in a changed refresh");
  const p = mk("Up"); p[0].name = "renamed-project"; kiri.on({ type: "composeprojects", logos: {}, projects: p });
  eq(!!document.querySelector('tr.group[data-cmpopen="renamed-project"]'), true, "the new name");
  eq(document.querySelector("table.clist tbody tr td.cu")?.textContent.length > 0, true, "the time it shows");
});
t("the same rows in another type are fitted again", () => {
  let fits = 0; const fit = fitColumns; fitColumns = () => { fits++; fit(); };
  render(); const quiet = fits;
  document.body.style.letterSpacing = "0.05em"; render(); const one = fits;
  document.body.style.letterSpacing = ""; render();
  fitColumns = fit;
  eq([quiet, one > 0, fits > one], [0, true, true], "fits: none unchanged, some on each change");
});
report(R);
