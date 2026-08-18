import https from 'https';

const accessToken = '1000.af9fbeef62a8d5a987f483bc8e8666bc.2dbe477230827c93f8a8c327cce441ba';

const payload = JSON.stringify({
  data: [
    {
      First_Name: "Emily",
      Date_of_Birth: "1995-08-15",
      Gender: "Female",
      Email: "emily.turner@example.com",
      Postal_Code: "600028",
      Address_Line_1: "42 Marina Bay View, Anna Nagar, Chennai",
      Mobile_No: "9876543210" // Exactly 10 digits without +91
    }
  ]
});

const req = https.request({
  hostname: 'www.zohoapis.in',
  port: 443,
  path: '/crm/v2/Patient',
  method: 'POST',
  headers: {
    'Authorization': `Zoho-oauthtoken ${accessToken}`,
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
