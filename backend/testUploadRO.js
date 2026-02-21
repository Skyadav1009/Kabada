const fs = require('fs');
const path = require('path');

async function testUploads() {
    const fetch = (await import('node-fetch')).default;
    const FormData = (await import('form-data')).default;

    const containerId = process.argv[2];

    // 1. Create a dummy file
    const testFile = path.join(__dirname, 'test.txt');
    fs.writeFileSync(testFile, 'Hello World Read-Only Test');

    // 2. Try to upload without admin password (should fail)
    const form1 = new FormData();
    form1.append('files', fs.createReadStream(testFile));

    console.log('--- TEST 1: Uploading without Admin Password ---');
    try {
        const res1 = await fetch(`http://localhost:5000/api/containers/${containerId}/files`, {
            method: 'POST',
            body: form1
        });
        console.log(`Status: ${res1.status}`);
        const data1 = await res1.json();
        console.log('Response:', data1);
    } catch (err) {
        console.error('Error:', err.message);
    }

    // 3. Try to upload with WRONG admin password (should fail)
    const form2 = new FormData();
    form2.append('files', fs.createReadStream(testFile));

    console.log('\n--- TEST 2: Uploading with WRONG Admin Password ---');
    try {
        const res2 = await fetch(`http://localhost:5000/api/containers/${containerId}/files`, {
            method: 'POST',
            headers: {
                'x-admin-password': 'wrongpassword'
            },
            body: form2
        });
        console.log(`Status: ${res2.status}`);
        const data2 = await res2.json();
        console.log('Response:', data2);
    } catch (err) {
        console.error('Error:', err.message);
    }

    // 4. Try to upload with CORRECT admin password (should succeed)
    const form3 = new FormData();
    form3.append('files', fs.createReadStream(testFile));

    console.log('\n--- TEST 3: Uploading with CORRECT Admin Password ---');
    try {
        const res3 = await fetch(`http://localhost:5000/api/containers/${containerId}/files`, {
            method: 'POST',
            headers: {
                'x-admin-password': 'apass'
            },
            body: form3
        });
        console.log(`Status: ${res3.status}`);
        const data3 = await res3.json();
        console.log('Response:', data3);
    } catch (err) {
        console.error('Error:', err.message);
    }

    // Cleanup
    fs.unlinkSync(testFile);
}

testUploads();
