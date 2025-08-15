export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.json([
    { id: "hitesh", name: "Hitesh Choudhary" },
    { id: "piyush", name: "Piyush Garg" },
  ]);
}
