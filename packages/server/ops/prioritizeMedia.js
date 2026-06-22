export default function (id) {
  const [kojo] = this;
  const db = kojo.get('db');
  db.prepare(
    "UPDATE jobs SET priority = 1 WHERE media_id = ? AND status IN ('pending', 'running')"
  ).run(Number(id));
}
