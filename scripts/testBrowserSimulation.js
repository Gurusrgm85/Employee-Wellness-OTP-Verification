import http from 'http';

const newAccessToken = '1000.af9fbeef62a8d5a987f483bc8e8666bc.2dbe477230827c93f8a8c327cce441ba';

const payload = JSON.stringify({
  data: [
    {
      First_Name: "Emily",
      Date_of_Birth: "1995-08-15",
      Gender: "Female",
      Email: "emily.turner@example.com",
      Postal_Code: "600028",
      Address_Line_1: "42 Marina Bay View, Anna Nagar, Chennai",
      Mobile: "+91 9876543210"
    }
  ]
});

// Send with Cookie & Origin exactly like the browser did in the screenshot
const req = http.request({
  hostname: 'localhost',
  port: 5173,
  path: '/zoho-api/crm/v2/Patient',
  method: 'POST',
  headers: {
    'Authorization': `Zoho-oauthtoken ${newAccessToken}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cookie': 'crmcsr=4c39c908-9b89-472c-b281-761997782cdc; _zcsr_tmp=4c39c908;',
    'Origin': 'http://localhost:5173',
    'Referer': 'http://localhost:5173/'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Body:', data);
  });
});

req.on('error', err => console.error(err));
req.write(payload);
req.end();
