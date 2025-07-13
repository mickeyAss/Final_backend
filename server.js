var app = require("./app");

// ใช้ process.env.PORT ถ้ามี หรือ fallback เป็นพอร์ต 3000 ถ้าไม่มีการกำหนด
const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Server is running on port ${port}`));