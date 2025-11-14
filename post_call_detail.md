Yep, that Post-Call Webhook box is exactly where you hook in the “send this to Slack when the call ends” logic.

But: don’t point it directly at Slack’s webhook URL. ElevenLabs will POST its own JSON payload; Slack’s incoming webhook expects a totally different JSON shape. You need a tiny middleman.

Wiring it up
	1.	Add a post-call endpoint on your server

Something like:

// e.g. /api/elevenlabs/post-call
app.post('/api/elevenlabs/post-call', async (req, res) => {
  try {
    const payload = req.body;

    // pull what you care about
    const {
      lead_full_name,
      first_name,
      last_name,
      lead_phone,
      customer_address,
      status,
      preferred_callback_time,
      consent_to_call_now,
      conversation_id,
      // depends on what ElevenLabs sends – transcript, summary, etc.
    } = payload.client_data || {};

    const text = `
📞 *New CMAC Call Completed*
• Name: ${lead_full_name || `${first_name} ${last_name}`}
• Phone: ${lead_phone}
• Address: ${customer_address}
• Status: ${status}
• Pref time: ${preferred_callback_time}
• Consent now: ${consent_to_call_now}
• Conv ID: ${conversation_id}
    `.trim();

    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('Post-call webhook error:', err);
    res.sendStatus(500);
  }
});

	2.	Expose it via ngrok

You already have https://cojovi.ngrok.dev/api/elevenlabs/init.
Do the same for your new route, e.g.:

https://cojovi.ngrok.dev/api/elevenlabs/post-call
	3.	Configure ElevenLabs

	•	Go to Workspace → Agents Settings (same screen you screenshotted).
	•	Click Create Webhook under Post-Call Webhook.
	•	Paste your https://cojovi.ngrok.dev/api/elevenlabs/post-call URL there and save.

	4.	Configure Slack app

	•	Enable Incoming Webhooks for your Slack app.
	•	Create a webhook for the target channel.
	•	Put that URL in SLACK_WEBHOOK_URL (env var your server uses).

After that, every time a call ends, ElevenLabs hits your post-call endpoint → your server formats the data → Slack gets a nice “Call completed” message in the channel.


Slack Details:

**Note:** Store all Slack credentials in environment variables (`.env` file) - never commit secrets to git.

Required environment variable:
- `SLACK_WEBHOOK_URL` - Your Slack incoming webhook URL

To get your webhook URL:
1. Go to your Slack app settings
2. Enable Incoming Webhooks
3. Create a webhook for your target channel
4. Copy the webhook URL and add it to your `.env` file as `SLACK_WEBHOOK_URL`