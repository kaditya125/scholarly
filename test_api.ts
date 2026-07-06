import axios from 'axios';

async function main() {
  try {
    const res = await axios.post('http://localhost:3000/api/admin/vector-db/query', {
      query: "what is the powerhouse of plant",
      namespace: "production",
      topK: 5
    });
    console.log(res.data);
  } catch (e: any) {
    console.error("ERROR", e.response?.status, e.response?.data);
  }
}
main();
