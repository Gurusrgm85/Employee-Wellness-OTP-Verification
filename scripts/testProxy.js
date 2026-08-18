import http from 'http';

const freshAccessToken = '1000.3c56a65f7f03542fac3ea230ad5b0e74.757497587226c7a9eb689d8588ad1827';

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

const req = http.request({
  hostname: 'localhost',
  port: 5173,
  path: '/zoho-api/crm/v2/Patient',
  method: 'POST',
  headers: {
    'Authorization': `Zoho-oauthtoken ${freshAccessToken}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Body:', data);
  });
});

req.write(payload);
req.end();
