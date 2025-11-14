Yep, that screenshot tells the story: your Slack formatter is running, but it’s pulling from the wrong part of the post-call payload, so every field comes back undefined → you turn it into N/A.

Also quick side note: those RTF files you uploaded earlier with the payload samples have expired on my side, so if you ever want me to re-open them you’d need to re-upload. Not needed for this fix though.

⸻

Where your data actually lives

From ElevenLabs’ docs, the post_call_transcription webhook looks like this:  ￼

{
  "type": "post_call_transcription",
  "data": {
    "conversation_id": "abc",
    "status": "done",
    "metadata": {
      "call_duration_secs": 22
    },
    "conversation_initiation_client_data": {
      "dynamic_variables": {
        "first_name": "Rudolph",
        "last_name": "RedNose",
        "lead_phone": "+1817…",
        "customer_address": "199 Co Rd 4840",
        "wix_submission_id": "…",
        "wix_contact_id": "…",
        "preferred_callback_time": "now",
        "consent_to_call_now": true,
        "request_type": "Residential Garage Doors Request",
        ...
      }
    }
  }
}

So for post-call you need to read from:
	•	Dynamic vars:
req.body.data.conversation_initiation_client_data.dynamic_variables
	•	Conversation ID:
req.body.data.conversation_id
	•	Status:
req.body.data.status
	•	Duration:
req.body.data.metadata.call_duration_secs

Right now you’re almost certainly doing something like:

const { lead_full_name, lead_phone } = payload.client_data || {};

→ client_data is undefined in post-call webhooks, so everything falls back to N/A.
status shows “completed” because you’re either hard-coding it or reading data.status correctly while everything else is wrong.

⸻

Fix your post-call handler

Update your post-call endpoint roughly like this:

app.post('/api/elevenlabs/post-call', async (req, res) => {
  try {
    const payload = req.body;

    // 1) Pull the dynamic variables from the correct place
    const dyn =
      payload?.data?.conversation_initiation_client_data?.dynamic_variables || {};

    const {
      lead_full_name,
      first_name,
      last_name,
      lead_phone,
      customer_address,
      preferred_callback_time,
      consent_to_call_now,
      wix_submission_id,
      wix_contact_id,
      request_type,
    } = dyn;

    // 2) Other call metadata
    const conversation_id = payload?.data?.conversation_id;
    const status = payload?.data?.status;
    const duration_secs = payload?.data?.metadata?.call_duration_secs;

    const name =
      lead_full_name || [first_name, last_name].filter(Boolean).join(' ') || 'N/A';

    const text = `
:telephone_receiver: *New CMAC Call Completed*

*Lead Information:*
• Name: ${name || 'N/A'}
• Phone: ${lead_phone || 'N/A'}
• Address: ${customer_address || 'N/A'}

*Call Details:*
• Conversation ID: ${conversation_id || 'N/A'}
• Status: ${status || 'N/A'}
• Duration: ${duration_secs != null ? duration_secs + 's' : 'N/A'}
• Request Type: ${request_type || 'N/A'}

*Follow-up:*
• Preferred Callback Time: ${preferred_callback_time || 'N/A'}
• Consent to Call Now: ${consent_to_call_now ? 'Yes' : 'No'}

*Tracking:*
• WIX Submission ID: ${wix_submission_id || 'N/A'}
• WIX Contact ID: ${wix_contact_id || 'N/A'}
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

One extra sanity check

Add a log once while testing:

console.log('ELEVEN POST-CALL PAYLOAD:', JSON.stringify(req.body, null, 2));

Trigger a call, look at your console, and confirm the data really is under:

data.conversation_initiation_client_data.dynamic_variables

Once you change the path, your Slack message should fill in with the real name, phone, address, WIX IDs, etc. instead of N/A.