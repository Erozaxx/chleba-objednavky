var EMAIL_QUEUE_KEY = "EMAIL_QUEUE";

function canSendEmail() {
  return MailApp.getRemainingDailyQuota() > 0;
}

function sendOrQueue(to, subject, htmlBody) {
  if (MailApp.getRemainingDailyQuota() > 0) {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: htmlBody
    });
    return { sent: true, queued: false };
  }

  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(EMAIL_QUEUE_KEY);
  var queue = raw ? JSON.parse(raw) : [];
  queue.push({ to: to, subject: subject, htmlBody: htmlBody });
  props.setProperty(EMAIL_QUEUE_KEY, JSON.stringify(queue));
  return { sent: false, queued: true };
}

function processQueue() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(EMAIL_QUEUE_KEY);
  if (!raw) return { sent: 0, remaining: 0 };

  var queue = JSON.parse(raw);
  if (!queue || queue.length === 0) return { sent: 0, remaining: 0 };

  var sent = 0;
  var remaining = [];

  for (var i = 0; i < queue.length; i++) {
    if (MailApp.getRemainingDailyQuota() > 0) {
      MailApp.sendEmail({
        to: queue[i].to,
        subject: queue[i].subject,
        htmlBody: queue[i].htmlBody
      });
      sent++;
    } else {
      remaining.push(queue[i]);
    }
  }

  if (remaining.length > 0) {
    props.setProperty(EMAIL_QUEUE_KEY, JSON.stringify(remaining));
  } else {
    props.deleteProperty(EMAIL_QUEUE_KEY);
  }

  return { sent: sent, remaining: remaining.length };
}

function getQueueLength() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(EMAIL_QUEUE_KEY);
  if (!raw) return 0;
  var queue = JSON.parse(raw);
  return queue ? queue.length : 0;
}
