(() => {
  if (window.__KST_CHATBOT_LOADED__) return;
  window.__KST_CHATBOT_LOADED__ = true;

  // Resolve every chatbot asset from the actual script location. This works
  // both at the website root and when the extracted site sits in a subfolder.
  const siteAsset = (path) => new URL(String(path).replace(/^\/+/, ""), `${location.origin}/`).href;

  // Load the visible widget styling from its own CSS file.
  if (!document.querySelector('link[data-kst-chatbot-css]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = siteAsset('/chatbot.css');
    stylesheet.dataset.kstChatbotCss = 'true';
    document.head.appendChild(stylesheet);
  }

  async function getKstConfig() {
    if (window.KST_CONFIG) return window.KST_CONFIG;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = siteAsset('config.js');
      script.onload = () => resolve(window.KST_CONFIG || {});
      script.onerror = () => resolve({});
      document.head.appendChild(script);
    });
  }

  async function loadPublishedFaqs() {
    const config = await getKstConfig();
    if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY ||
        /(YOUR_|REPLACE_ME|CHANGE_ME|<[^>]+>)/i.test(config.SUPABASE_URL) ||
        /(YOUR_|REPLACE_ME|CHANGE_ME|<[^>]+>)/i.test(config.SUPABASE_PUBLISHABLE_KEY)) return [];
    const endpoint = new URL('/rest/v1/faq_entries', config.SUPABASE_URL);
    endpoint.search = new URLSearchParams({
      select: 'question,answer',
      is_published: 'eq.true',
      order: 'question.asc',
      limit: '40'
    }).toString();
    const response = await fetch(endpoint.href, {
      headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY, accept: 'application/json' }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`FAQ request failed (${response.status}): ${detail.slice(0, 240)}`);
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows.map(row => ({
      question: String(row?.question || '').trim().slice(0, 300),
      answer: String(row?.answer || '').trim().slice(0, 1800)
    })).filter(row => row.question && row.answer).slice(0, 40) : [];
  }

  let faqPromise = null;
  function getPublishedFaqs() {
    if (!faqPromise) {
      faqPromise = loadPublishedFaqs().catch(error => {
        console.warn('KST published FAQs could not be loaded. Chat will continue without FAQ context.', error);
        return [];
      });
    }
    return faqPromise;
  }

  function selectRelevantFaqs(question, faqs) {
    const ignored = new Set(['the','and','for','with','you','your','our','what','when','where','which','who','how','does','do','can','are','is','to','of','in','on','a','an','we','i','me','my','it','this','that','please','tell','about']);
    const terms = [...new Set((String(question).toLowerCase().match(/[a-z0-9]{2,}/g) || []).filter(word => !ignored.has(word)))];
    if (!terms.length) return [];
    return faqs.map(faq => {
      const questionText = faq.question.toLowerCase();
      const answerText = faq.answer.toLowerCase();
      const score = terms.reduce((total, term) => total + (questionText.includes(term) ? 2 : answerText.includes(term) ? 1 : 0), 0);
      return { faq, score };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => item.faq);
  }

  function mountChatbot() {
    if (!document.body || document.getElementById('kst-chat-launch')) return;

    const launch = document.createElement('button');
    launch.id = 'kst-chat-launch';
    launch.type = 'button';
    launch.setAttribute('aria-label', 'Open Kingdom Spirit Technology chat');
    launch.setAttribute('title', 'Chat with KST');
    launch.setAttribute('aria-expanded', 'false');
    launch.innerHTML = '<span class="kst-chat-mark" aria-hidden="true"><strong>KST</strong><small>TECH</small></span>';
    // Critical inline fallback ensures a visible circular launcher even if a
    // local preview temporarily fails to load the separate stylesheet.
    launch.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483000;width:54px;height:54px;min-width:54px;min-height:54px;border:1px solid rgba(86,220,255,.9);border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;background:linear-gradient(140deg,#56dcff,#438bff);color:#06101e;box-shadow:0 10px 30px rgba(30,120,255,.4);cursor:pointer;';

    const panel = document.createElement('section');
    panel.id = 'kst-chat-panel';
    panel.setAttribute('aria-label', 'Customer support chat');
    panel.innerHTML = `<div id="kst-chat-head"><div><strong>Kingdom Spirit Assistant</strong><small>Ask us about our services</small></div><button id="kst-chat-close" type="button" aria-label="Close chat">×</button></div><div id="kst-chat-messages" aria-live="polite"><div class="kst-chat-msg bot">Hello! Welcome to Kingdom Spirit Technology. How can I help you today?</div></div><form id="kst-chat-form"><input id="kst-chat-input" maxlength="1200" autocomplete="off" placeholder="Type your question…" aria-label="Your question" required><button id="kst-chat-send" type="submit">Send</button></form><div id="kst-chat-note">AI-generated answers may be imperfect. Never share passwords, OTPs or payment details.</div>`;
    document.body.append(launch, panel);

    const messagesEl = panel.querySelector('#kst-chat-messages');
    const input = panel.querySelector('#kst-chat-input');
    const send = panel.querySelector('#kst-chat-send');
    const history = [];
    const addMessage = (text, who) => {
      const node = document.createElement('div');
      node.className = `kst-chat-msg ${who}`;
      node.textContent = text;
      messagesEl.appendChild(node);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };

    launch.addEventListener('click', () => {
      panel.classList.add('kst-open');
      launch.setAttribute('aria-expanded', 'true');
      launch.hidden = true;
      input.focus();
    });
    panel.querySelector('#kst-chat-close').addEventListener('click', () => {
      panel.classList.remove('kst-open');
      launch.setAttribute('aria-expanded', 'false');
      launch.hidden = false;
      launch.focus();
    });
    panel.querySelector('#kst-chat-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question || send.disabled) return;
      addMessage(question, 'user');
      history.push({ role: 'user', content: question });
      input.value = '';
      send.disabled = true;
      send.textContent = '…';
      const typing = document.createElement('div');
      typing.className = 'kst-chat-msg bot';
      typing.textContent = 'Thinking…';
      messagesEl.appendChild(typing);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      try {
        const publishedFaqs = selectRelevantFaqs(question, await getPublishedFaqs());
        const response = await fetch(siteAsset('api/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-10), faqs: publishedFaqs })
        });
        const data = await response.json();
        typing.remove();
        if (!response.ok) throw new Error(data.error || 'The assistant is temporarily unavailable.');
        const reply = data.reply || 'I could not prepare an answer. Please contact our team.';
        addMessage(reply, 'bot');
        history.push({ role: 'assistant', content: reply });
      } catch (error) {
        typing.remove();
        addMessage(error.message || 'Sorry, I am unavailable. Please email kstechnologies001@gmail.com.', 'bot');
      } finally {
        send.disabled = false;
        send.textContent = 'Send';
        input.focus();
      }
    });
  }

  if (document.body) mountChatbot();
  else document.addEventListener('DOMContentLoaded', mountChatbot, { once: true });
})();
