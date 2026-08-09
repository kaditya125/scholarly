async function main() {
  console.log('=== CHECKING TWILIO ACCOUNT STATUS ===');
  const accountSid = process.env.TWILIO_ACCOUNT_SID || 'REDACTED';
  const authToken = process.env.TWILIO_AUTH_TOKEN || 'REDACTED';

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  
  // 1. Check Account details
  const accountUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
  try {
    const res = await fetch(accountUrl, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    const data = await res.json() as any;
    if (res.ok) {
      console.log('✅ Account Details:');
      console.log('- Friendly Name:', data.friendly_name);
      console.log('- Status:', data.status);
      console.log('- Type:', data.type);
    } else {
      console.error('❌ Failed to fetch Account details:', data);
    }
  } catch (e: any) {
    console.error('Error fetching account details:', e.message);
  }

  // 2. Check purchased numbers
  const numbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`;
  try {
    const res = await fetch(numbersUrl, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    const data = await res.json() as any;
    if (res.ok) {
      console.log(`\n✅ Found ${data.incoming_phone_numbers.length} Incoming Phone Numbers.`);
      data.incoming_phone_numbers.forEach((num: any) => {
        console.log(`  - Number: ${num.phone_number} (Capabilities: ${JSON.stringify(num.capabilities)})`);
      });
    } else {
      console.error('❌ Failed to fetch numbers:', data);
    }
  } catch (e: any) {
    console.error('Error fetching numbers:', e.message);
  }
}

main().catch(console.error);

export {};
