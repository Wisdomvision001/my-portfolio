/* ==========================================================================
   WISDOM AUDI UNIVERSE — Entrance Choreography, Menu & Interactive Logic
   ========================================================================== */

(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Entrance animation cleanup + rAF fallback so content is never hidden
  const appearEls = document.querySelectorAll('.appear');
  const heroAtmo = document.querySelector('.hero-atmosphere');

  appearEls.forEach((el) => {
    el.addEventListener(
      'animationend',
      () => {
        el.classList.add('is-in');
      },
      { once: true }
    );
  });

  if (heroAtmo) {
    heroAtmo.addEventListener(
      'animationend',
      () => {
        heroAtmo.classList.add('is-in');
      },
      { once: true }
    );
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      appearEls.forEach((el) => {
        const anims = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
        const active = anims.some((a) => a.playState === 'running' || a.playState === 'finished');
        if (!active) {
          el.classList.add('is-in');
        }
      });
      if (heroAtmo) {
        const anims = typeof heroAtmo.getAnimations === 'function' ? heroAtmo.getAnimations() : [];
        const active = anims.some((a) => a.playState === 'running' || a.playState === 'finished');
        if (!active) {
          heroAtmo.classList.add('is-in');
        }
      }
    });
  });

  // 2. Mobile menu toggle, Escape & resize close
  const burger = document.getElementById('menu-toggle');
  const nav = document.getElementById('site-nav');
  const backdrop = document.getElementById('menu-backdrop');

  function setMenuOpen(open) {
    document.body.classList.toggle('menu-open', open);
    if (burger) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
  }

  if (burger) {
    burger.addEventListener('click', () => {
      setMenuOpen(!document.body.classList.contains('menu-open'));
    });
  }

  if (nav) {
    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setMenuOpen(false));
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => setMenuOpen(false));
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
      setMenuOpen(false);
      if (burger) burger.focus();
    }
  });

  const desktopMq = window.matchMedia('(min-width: 901px)');
  const onDesktopMatch = (e) => {
    if (e.matches && document.body.classList.contains('menu-open')) {
      setMenuOpen(false);
    }
  };
  if (typeof desktopMq.addEventListener === 'function') {
    desktopMq.addEventListener('change', onDesktopMatch);
  }

  // 3. Scroll progress hairline
  const bar = document.getElementById('scroll-progress-bar');
  if (bar) {
    let ticking = false;
    const updateProgress = () => {
      ticking = false;
      const doc = document.documentElement;
      const maxScroll = doc.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      bar.style.transform = `scaleX(${progress.toFixed(4)})`;
    };
    const onScrollOrResize = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateProgress);
      }
    };
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    updateProgress();
  }

  // 4. Scroll-triggered [data-reveal] observer
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length) {
    if (prefersReducedMotion) {
      revealEls.forEach((el) => el.classList.add('in'));
    } else {
      const pending = new Set(revealEls);
      let revealTicking = false;
      let observer = null;

      const revealEl = (el) => {
        if (!pending.has(el)) return;
        el.classList.add('in');
        pending.delete(el);
        if (observer) observer.unobserve(el);
      };

      const cleanup = () => {
        window.removeEventListener('scroll', onRevealScroll);
        window.removeEventListener('resize', onRevealScroll);
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      };

      const checkElementsInViewport = () => {
        revealTicking = false;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const trigger = vh - 24;
        pending.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.top <= trigger && rect.bottom >= 0) {
            revealEl(el);
          }
        });
        if (pending.size === 0) cleanup();
      };

      const onRevealScroll = () => {
        if (!revealTicking) {
          revealTicking = true;
          window.requestAnimationFrame(checkElementsInViewport);
        }
      };

      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) revealEl(entry.target);
            });
            if (pending.size === 0) cleanup();
          },
          { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
        );
        pending.forEach((el) => observer.observe(el));
      }

      window.addEventListener('scroll', onRevealScroll, { passive: true });
      window.addEventListener('resize', onRevealScroll, { passive: true });
      checkElementsInViewport();
    }
  }

  // 5. Interactive Connected Operations Blueprint (#solutions)
  const SOLUTIONS_DATA = {
    agents: {
      title: 'AI Agents & Assistants',
      summary: 'Autonomous assistants that interpret requests, apply business rules, and execute tasks.',
      nodes: [
        { step: '01 · INPUT', title: 'Trigger', sub: 'Event or webhook' },
        { step: '02 · CONTEXT', title: 'Incoming request', sub: 'Structured payload' },
        { step: '03 · AI CORE', title: 'AI Agent', sub: 'Reasoning & tool use', core: true },
        { step: '04 · OUTCOME', title: 'Executed task', sub: 'Verified completion' }
      ]
    },
    support: {
      title: 'Customer Support',
      summary: 'Always-on support agents that resolve inquiries immediately or escalate with full context.',
      nodes: [
        { step: '01 · INTAKE', title: 'Customer enquiry', sub: 'Web, email, or chat' },
        { step: '02 · AI CORE', title: 'AI Support Agent', sub: 'Intent & knowledge check', core: true },
        { step: '03 · OUTCOME', title: 'Response / Human Escalation', sub: 'Instant answer or handoff' }
      ]
    },
    sales: {
      title: 'Sales & Leads',
      summary: 'Capture inbound demand immediately, qualify prospect fit, and sync CRM follow-ups.',
      nodes: [
        { step: '01 · CAPTURE', title: 'New lead', sub: 'Inbound form or inquiry' },
        { step: '02 · AI CORE', title: 'AI Qualification', sub: 'Scope & priority check', core: true },
        { step: '03 · SYNC', title: 'CRM Update', sub: 'Structured record log' },
        { step: '04 · ACTION', title: 'Sales Follow-up', sub: 'Booked call or outreach' }
      ]
    },
    process: {
      title: 'Workflow Automation',
      summary: 'Orchestrate disconnected business events and applications into continuous automated pipelines.',
      nodes: [
        { step: '01 · EVENT', title: 'Business Event', sub: 'Order, invoice, or form' },
        { step: '02 · AI CORE', title: 'Automation Engine', sub: 'Rules & routing logic', core: true },
        { step: '03 · BRIDGE', title: 'Connected Applications', sub: 'APIs, sheets & tools' },
        { step: '04 · RESULT', title: 'Completed Workflow', sub: 'End-to-end execution' }
      ]
    },
    infra: {
      title: 'Web & Custom AI',
      summary: 'Bespoke web infrastructure paired with custom machine learning and intelligence pipelines.',
      nodes: [
        { step: '01 · SOURCE', title: 'Business Data', sub: 'Operational telemetry' },
        { step: '02 · AI CORE', title: 'Custom AI System', sub: 'Tailored model & APIs', core: true },
        { step: '03 · ENGINE', title: 'Intelligent Processing', sub: 'Classification & scoring' },
        { step: '04 · VALUE', title: 'Business Output', sub: 'Live web interface' }
      ]
    }
  };

  const CORE_SVG = `<div class="bp-core-ring" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="rgba(255,255,255,0.28)" stroke-width="1" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="5" stroke="rgba(255,255,255,0.75)" stroke-width="1.2"/><circle cx="12" cy="12" r="1.8" fill="#ffffff"/></svg></div>`;
  const WIRE_HTML = `<div class="bp-wire" aria-hidden="true"><span class="bp-wire-line"></span><span class="bp-wire-pulse"></span><span class="bp-wire-arrow">→</span></div>`;

  const bpTabs = document.querySelectorAll('.bp-tab[data-solution]');
  const solTitle = document.getElementById('sol-title');
  const solSummary = document.getElementById('sol-summary');
  const bpDiagram = document.getElementById('blueprint-diagram');
  const solDiscussBtn = document.getElementById('sol-discuss-btn');
  let activeSolutionTitle = SOLUTIONS_DATA.agents.title;

  function renderBlueprint(item) {
    if (!bpDiagram) return;
    bpDiagram.innerHTML = item.nodes
      .map((node, idx) => {
        const coreDot = node.core ? '<span class="bp-core-dot"></span>' : '';
        const coreRing = node.core ? CORE_SVG : '';
        const nodeHtml = `
          <div class="bp-node${node.core ? ' bp-node--core' : ''}">
            ${coreRing}
            <div class="bp-node-head"><span class="bp-node-step">${node.step}</span>${coreDot}</div>
            <strong class="bp-node-title">${node.title}</strong>
            <span class="bp-node-sub">${node.sub}</span>
          </div>`;
        return idx < item.nodes.length - 1 ? nodeHtml + WIRE_HTML : nodeHtml;
      })
      .join('');
  }

  if (bpTabs.length && solTitle && bpDiagram) {
    let switchTimer = null;
    bpTabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = SOLUTIONS_DATA[btn.dataset.solution];
        if (!item) return;

        bpTabs.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', String(active));
        });

        activeSolutionTitle = item.title;
        solTitle.textContent = item.title;
        if (solSummary) solSummary.textContent = item.summary;

        if (prefersReducedMotion) {
          renderBlueprint(item);
          return;
        }

        if (switchTimer) window.clearTimeout(switchTimer);
        bpDiagram.classList.add('is-switching');
        switchTimer = window.setTimeout(() => {
          renderBlueprint(item);
          requestAnimationFrame(() => {
            bpDiagram.classList.remove('is-switching');
          });
        }, 120);
      });
    });

    if (solDiscussBtn) {
      solDiscussBtn.addEventListener('click', () => {
        const subjectField = document.getElementById('contact-subject');
        if (subjectField && !subjectField.value.trim()) {
          subjectField.value = activeSolutionTitle;
        }
      });
    }
  }

  // 6. Interactive Industries Selector
  const INDUSTRIES_DATA = {
    retail: {
      kicker: 'Retail & E-commerce',
      title: 'AI Shopping Guidance & Order Support',
      desc: 'Automate product recommendations, instant order tracking replies, and post-purchase customer follow-ups.',
      systems: 'Storefront · Inventory · Messaging Channels'
    },
    hospitality: {
      kicker: 'Restaurants & Hospitality',
      title: 'Digital Ordering & Reservation Assistants',
      desc: 'Streamline menu ordering, table booking inquiries, and automated kitchen or front-desk routing.',
      systems: 'Menu Portals · Reservations · Customer Messaging'
    },
    beauty: {
      kicker: 'Beauty & Personal Care',
      title: '24/7 Booking & Client Concierge',
      desc: 'Keep calendars full with automated appointment scheduling, pre-visit guidance, and timely reminders.',
      systems: 'Booking Calendars · Client Profiles · Reminders'
    },
    realestate: {
      kicker: 'Real Estate',
      title: 'Lead Qualification & Viewing Scheduler',
      desc: 'Capture buyer and tenant inquiries immediately, qualify preferences, and coordinate property viewings.',
      systems: 'Listing Portals · Agent Calendars · CRM'
    },
    logistics: {
      kicker: 'Logistics & Transportation',
      title: 'Dispatch Coordination & Tracking Automation',
      desc: 'Automate shipment status updates, dispatch routing alerts, and operational exception notifications.',
      systems: 'Location Feeds · Dispatch Dashboards · Alerts'
    },
    services: {
      kicker: 'Professional Services',
      title: 'Client Intake & Workflow Orchestration',
      desc: 'Automate onboarding questionnaires, document routing, and recurring client scheduling.',
      systems: 'Client Portals · Document Workflows · Calendars'
    },
    smb: {
      kicker: 'Small & Medium Businesses',
      title: 'Unified AI Support & Digital Systems',
      desc: 'Replace scattered manual tasks with automated support, lead capture, and custom business web tools.',
      systems: 'Web Forms · Email · CRM · Core Tools'
    }
  };

  const indTabs = document.querySelectorAll('[data-industry]');
  const indKicker = document.getElementById('ind-kicker');
  const indTitle = document.getElementById('ind-title');
  const indDesc = document.getElementById('ind-desc');
  const indSystems = document.getElementById('ind-systems');

  if (indTabs.length && indTitle) {
    indTabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const data = INDUSTRIES_DATA[btn.dataset.industry];
        if (!data) return;
        indTabs.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', String(active));
        });
        if (indKicker) indKicker.textContent = data.kicker;
        indTitle.textContent = data.title;
        if (indDesc) indDesc.textContent = data.desc;
        if (indSystems) indSystems.textContent = data.systems;
      });
    });
  }

  // 7. System Preview Modal
  const PROJECTS_DATA = {
    agencyos: {
      eyebrow: '01 · AI Operations · In Development',
      title: 'AgencyOS',
      subtitle: 'AI-powered agency operations platform',
      image: 'images/project-agencyos.jpg',
      desc: 'An ongoing system built to coordinate AI-assisted agency workflows, task automation, and client pipeline operations.',
      details: 'Brings project coordination, automated workflow triggers, and client delivery into one focused web workspace.',
      tech: ['React', 'TypeScript', 'REST APIs', 'Workflow Automation'],
      note: 'Currently in active development. Repository links available via GitHub.',
      url: 'https://github.com/Wisdomvision001/'
    },
    apiabuse: {
      eyebrow: '02 · Machine Learning · Anomaly Detection',
      title: 'API Abuse & Bot Detection',
      subtitle: 'Automated traffic classification & anomaly detection',
      image: 'images/project-api-abuse.jpg',
      desc: 'Machine learning system engineered to identify suspicious API behavior and automated bot activity.',
      details: 'Combines Python data processing with Random Forest classification and an interactive diagnostic interface.',
      tech: ['Python', 'Pandas', 'NumPy', 'Scikit-learn', 'Random Forest', 'Streamlit'],
      note: 'Applied machine learning project focused on security classification.',
      url: 'https://github.com/Wisdomvision001/'
    },
    signal: {
      eyebrow: '03 · Real-Time Workflow · Dispatch',
      title: 'SIGNAL',
      subtitle: 'Emergency location-sharing and incident dispatch system',
      image: 'images/project-signal.jpg',
      desc: 'Real-time dispatch platform designed to coordinate location sharing, incident reporting, and rapid team response.',
      details: 'Streams spatial context directly into structured incident coordination workflows.',
      tech: ['React', 'JavaScript', 'Geolocation API', 'HTML5', 'CSS3'],
      note: 'Built for rapid spatial awareness and operational routing.',
      url: 'https://github.com/Wisdomvision001/'
    },
    wisdomkitchen: {
      eyebrow: '04 · Hospitality · Web Infrastructure',
      title: 'WisdomKitchen',
      subtitle: 'Digital restaurant ordering platform',
      image: 'images/project-wisdomkitchen.jpg',
      desc: 'Digital restaurant ordering application connecting menu discovery directly to structured order fulfillment.',
      details: 'Pairs responsive customer ordering with structured backend order handling in Python and Flask.',
      tech: ['Python', 'Flask', 'JavaScript', 'HTML5', 'CSS3'],
      note: 'Hospitality ordering application demonstrating end-to-end digital infrastructure.',
      url: 'https://github.com/Wisdomvision001/'
    },
    lifeguard360: {
      eyebrow: '05 · Emergency Response · Guided Triage',
      title: 'Lifeguard360',
      subtitle: 'Structured first-aid and emergency guidance application',
      image: 'images/project-lifeguard360.jpg',
      desc: 'Web-based emergency response and guided first-aid triage platform designed for rapid decision support.',
      details: 'Guides responders step by step through structured emergency protocols in a clear mobile-first interface.',
      tech: ['HTML5', 'CSS3', 'JavaScript', 'Triage Workflows'],
      note: 'Built for clarity and fast situational guidance under pressure.',
      url: 'https://github.com/Wisdomvision001/'
    }
  };

  const modalBackdrop = document.getElementById('project-modal');
  const modalClose = document.getElementById('modal-close-btn');
  const modalTriggers = document.querySelectorAll('[data-open-project]');
  if (modalBackdrop && modalClose && modalTriggers.length) {
    let lastBtn = null;
    const closeModal = () => {
      modalBackdrop.classList.remove('open');
      modalBackdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastBtn) lastBtn.focus();
    };
    modalTriggers.forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = PROJECTS_DATA[btn.dataset.openProject];
        if (!p) return;
        lastBtn = btn;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('modal-eyebrow', p.eyebrow);
        set('modal-title', p.title);
        set('modal-subtitle', p.subtitle);
        set('modal-desc', p.desc);
        set('modal-details', p.details);
        set('modal-config-note', p.note);
        const img = document.getElementById('modal-img');
        if (img) { img.src = p.image; img.alt = p.title; }
        const tech = document.getElementById('modal-tech');
        if (tech) tech.innerHTML = p.tech.map((t, i) => (i > 0 ? `<span class="sep">·</span><span>${t}</span>` : `<span>${t}</span>`)).join('');
        const gh = document.getElementById('modal-github-link');
        if (gh) gh.href = p.url;
        modalBackdrop.classList.add('open');
        modalBackdrop.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        modalClose.focus();
      });
    });
    modalClose.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop.classList.contains('open')) closeModal();
    });
  }

  // 8. Contact Discovery Brief & Email Copy
  const form = document.getElementById('contact-form');
  const copyEmailBtn = document.getElementById('copy-email-btn');
  const copyEmailStatus = document.getElementById('copy-email-status');
  const TARGET_EMAIL = 'wisdomaudiuniverse@gmail.com';

  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(TARGET_EMAIL);
        if (copyEmailStatus) copyEmailStatus.textContent = `Copied ${TARGET_EMAIL}`;
      } catch {
        if (copyEmailStatus) copyEmailStatus.textContent = TARGET_EMAIL;
      }
    });
  }

  if (form) {
    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    const subjectInput = document.getElementById('contact-subject');
    const messageInput = document.getElementById('contact-message');
    const nameError = document.getElementById('error-name');
    const emailError = document.getElementById('error-email');
    const messageError = document.getElementById('error-message');
    const feedbackBox = document.getElementById('form-feedback');
    const feedbackText = document.getElementById('form-feedback-text');
    const mailtoBtn = document.getElementById('feedback-mailto-btn');
    const copyBtn = document.getElementById('feedback-copy-btn');
    let latestBrief = '';

    const setErr = (input, err, msg) => {
      if (!input || !err) return;
      input.classList.toggle('has-error', Boolean(msg));
      input.setAttribute('aria-invalid', String(Boolean(msg)));
      err.textContent = msg || '';
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalSubmitLabel = submitBtn ? submitBtn.textContent : 'Request Discovery Brief';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitBtn && submitBtn.disabled) return;

      let ok = true;
      const n = (nameInput?.value || '').trim();
      const em = (emailInput?.value || '').trim();
      const m = (messageInput?.value || '').trim();
      if (n.length < 2) { setErr(nameInput, nameError, 'Please enter your name.'); ok = false; } else { setErr(nameInput, nameError, ''); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { setErr(emailInput, emailError, 'Please enter a valid work email.'); ok = false; } else { setErr(emailInput, emailError, ''); }
      if (m.length < 10) { setErr(messageInput, messageError, 'Please share a brief note (10+ characters).'); ok = false; } else { setErr(messageInput, messageError, ''); }
      if (!ok) { if (feedbackBox) feedbackBox.classList.remove('visible'); return; }

      const subj = (subjectInput?.value || '').trim() || 'AI Business Automation';
      const fullSubj = `[WISDOM AUDI UNIVERSE] ${subj} — ${n}`;
      const body = `From: ${n} (${em})\nFocus: ${subj}\n\n${m}`;
      latestBrief = `To: ${TARGET_EMAIL}\nSubject: ${fullSubj}\n\n${body}`;
      if (mailtoBtn) mailtoBtn.href = `mailto:${TARGET_EMAIL}?subject=${encodeURIComponent(fullSubj)}&body=${encodeURIComponent(body)}`;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }

      try {
        const resp = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: n,
            email: em,
            subject: subj,
            message: m,
            website: ''
          })
        });
        const data = await resp.json().catch(() => ({}));

        if (resp.status === 409 && data.duplicate) {
          if (feedbackText) {
            feedbackText.textContent = data.error || `A matching enquiry was already received (Ref: ${data.referenceId || ''}).`;
          }
          if (feedbackBox) feedbackBox.classList.add('visible');
          return;
        }

        if (!resp.ok) {
          if (data.fieldErrors && typeof data.fieldErrors === 'object') {
            if (data.fieldErrors.name) setErr(nameInput, nameError, data.fieldErrors.name);
            if (data.fieldErrors.email) setErr(emailInput, emailError, data.fieldErrors.email);
            if (data.fieldErrors.message) setErr(messageInput, messageError, data.fieldErrors.message);
          }
          if (feedbackText) {
            feedbackText.textContent =
              data.error || 'Could not submit via server right now. Click below to open your email app or copy the brief.';
          }
          if (feedbackBox) feedbackBox.classList.add('visible');
          return;
        }

        const custStatus = data.notifications?.customerConfirmation?.status || '';
        const agencyStatus = data.notifications?.agencyNotification?.status || '';
        let summaryText = `Enquiry saved (Ref: ${data.referenceId || 'LOGGED'}).`;
        if (custStatus === 'sent') {
          summaryText += ` An acknowledgement email has been sent to ${em}.`;
        } else if (agencyStatus === 'sent') {
          summaryText += ` Our team has been notified and will follow up at ${em}.`;
        } else {
          summaryText += ` Automated email confirmation could not be delivered right now; you can also use the email app or copy options below.`;
        }
        if (feedbackText) feedbackText.textContent = summaryText;
        if (feedbackBox) feedbackBox.classList.add('visible');
        form.reset();
      } catch {
        if (feedbackText) {
          feedbackText.textContent = 'Network issue reaching the server. Click below to open your email client or copy the formatted message.';
        }
        if (feedbackBox) feedbackBox.classList.add('visible');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalSubmitLabel;
        }
      }
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        if (!latestBrief) return;
        try {
          await navigator.clipboard.writeText(latestBrief);
          if (feedbackText) feedbackText.textContent = `Copied brief for ${TARGET_EMAIL}.`;
        } catch {
          if (feedbackText) feedbackText.textContent = `Send directly to ${TARGET_EMAIL}.`;
        }
      });
    }
  }

  // 9. Wisdom AI — Gemini-Powered Business Consultation Assistant
  (function initWisdomAI() {
    if (document.getElementById('wisdom-ai-root')) return;

    const SESSION_KEY = 'wisdom_ai_session_v1';
    const WELCOME_MESSAGE =
      "Hello — I'm Wisdom AI, your Business Consultant at Wisdom Audi Universe. Tell me a bit about your business or what takes up too much manual time, and we can explore practical AI automation solutions.";
    const SUGGESTED_PROMPTS = [
      'I own a restaurant. How can AI help?',
      'How can AI automate customer support?',
      'Help me automate sales and lead follow-ups'
    ];
    const SOLUTION_OPTIONS = [
      'AI Agents & Intelligent Assistants',
      'AI Customer Support',
      'Sales & Lead Automation',
      'Workflow & Business Process Automation',
      'Custom AI Systems & Applications',
      'Web Development & Digital Infrastructure',
      'General Business Automation Assessment'
    ];

    const root = document.createElement('div');
    root.id = 'wisdom-ai-root';
    root.className = 'wai-root';
    root.innerHTML = `
      <button
        type="button"
        id="wai-launcher"
        class="wai-launcher"
        aria-expanded="false"
        aria-controls="wai-panel"
        aria-label="Open Wisdom AI business consultation assistant"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z"/>
        </svg>
        <span>Wisdom AI</span>
        <span class="wai-launcher-dot" aria-hidden="true"></span>
      </button>

      <section
        id="wai-panel"
        class="wai-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="wai-title"
        aria-hidden="true"
      >
        <header class="wai-header">
          <div class="wai-brand">
            <div class="wai-brand-mark" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z"/>
              </svg>
            </div>
            <div>
              <h2 id="wai-title" class="wai-brand-title">Wisdom AI</h2>
              <p class="wai-brand-role">AI Business Consultant</p>
            </div>
          </div>

          <div class="wai-header-actions">
            <button type="button" id="wai-reset-btn" class="wai-icon-btn" title="New conversation" aria-label="Start new conversation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
            <button type="button" id="wai-minimize-btn" class="wai-icon-btn" title="Minimize" aria-label="Minimize chat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                <path d="M5 12h14"/>
              </svg>
            </button>
            <button type="button" id="wai-close-btn" class="wai-icon-btn" title="Close" aria-label="Close chat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>
        </header>

        <div id="wai-messages" class="wai-messages" aria-live="polite"></div>

        <footer class="wai-composer">
          <form id="wai-form" class="wai-input-row" novalidate>
            <textarea
              id="wai-input"
              class="wai-input"
              rows="1"
              maxlength="1800"
              placeholder="Ask how AI can automate your business..."
              aria-label="Message Wisdom AI"
            ></textarea>
            <button type="submit" id="wai-send" class="wai-send-btn" aria-label="Send message" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
            </button>
          </form>
          <div class="wai-footer-note">
            <span>Session-only</span>
            <div class="wai-footer-links">
              <button type="button" id="wai-open-catalogue-btn" class="wai-consult-link">Email catalogue</button>
              <button type="button" id="wai-open-consult-btn" class="wai-consult-link">Request consultation</button>
            </div>
          </div>
        </footer>
      </section>
    `;

    document.body.appendChild(root);

    const launcher = document.getElementById('wai-launcher');
    const panel = document.getElementById('wai-panel');
    const messagesEl = document.getElementById('wai-messages');
    const formEl = document.getElementById('wai-form');
    const inputEl = document.getElementById('wai-input');
    const sendBtn = document.getElementById('wai-send');
    const resetBtn = document.getElementById('wai-reset-btn');
    const minimizeBtn = document.getElementById('wai-minimize-btn');
    const closeBtn = document.getElementById('wai-close-btn');
    const openConsultBtn = document.getElementById('wai-open-consult-btn');
    const openCatalogueBtn = document.getElementById('wai-open-catalogue-btn');

    let isOpen = false;
    let isStreaming = false;
    let activeAbort = null;
    let leadSubmittedRef = null;
    let leadCardEl = null;
    let catalogueCardEl = null;

    // Conversation history sent to /api/chat (excludes initial UI welcome message)
    let history = [];
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          history = parsed.filter(
            (m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim()
          );
        }
      }
    } catch {
      history = [];
    }

    function saveHistory() {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(history.slice(-24)));
      } catch {
        // Ignore storage errors in private mode
      }
      launcher.classList.toggle('has-session', history.length > 0);
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderFormattedText(container, text) {
      const escaped = escapeHtml(text || '');
      const lines = escaped.split(/\r?\n/);
      let html = '';
      let inList = false;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        if (/^[-*]\s+/.test(line)) {
          if (!inList) {
            html += '<ul>';
            inList = true;
          }
          html += `<li>${formatted.replace(/^[-*]\s+/, '')}</li>`;
        } else {
          if (inList) {
            html += '</ul>';
            inList = false;
          }
          if (line.length > 0) {
            html += `<p>${formatted}</p>`;
          }
        }
      }
      if (inList) html += '</ul>';
      container.innerHTML = html || '<p></p>';
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendBubble(role, text) {
      const div = document.createElement('div');
      div.className = `wai-msg wai-msg--${role === 'user' ? 'user' : 'assistant'}`;
      if (role === 'user') {
        div.textContent = text;
      } else {
        renderFormattedText(div, text);
      }
      messagesEl.appendChild(div);
      scrollToBottom();
      return div;
    }

    function appendTypingBubble() {
      const div = document.createElement('div');
      div.className = 'wai-msg wai-msg--assistant';
      div.setAttribute('aria-label', 'Wisdom AI is thinking');
      div.innerHTML = `<div class="wai-typing"><span></span><span></span><span></span><em class="wai-typing-label">Thinking...</em></div>`;
      messagesEl.appendChild(div);
      scrollToBottom();
      return div;
    }

    function appendErrorBanner(message, retryText) {
      const div = document.createElement('div');
      div.className = 'wai-msg wai-msg--error';
      const p = document.createElement('p');
      p.textContent = message;
      div.appendChild(p);

      const actions = document.createElement('div');
      actions.className = 'wai-error-actions';

      if (retryText) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'wai-inline-btn';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => {
          div.remove();
          sendUserMessage(retryText, { skipUserAppend: true });
        });
        actions.appendChild(retryBtn);
      }

      const emailLink = document.createElement('a');
      emailLink.href = 'mailto:wisdomaudiuniverse@gmail.com';
      emailLink.className = 'wai-inline-btn';
      emailLink.textContent = 'Email Team';
      actions.appendChild(emailLink);

      div.appendChild(actions);
      messagesEl.appendChild(div);
      scrollToBottom();
    }

    function renderInitialThread() {
      messagesEl.innerHTML = '';
      leadCardEl = null;
      catalogueCardEl = null;
      appendBubble('model', WELCOME_MESSAGE);

      if (history.length === 0) {
        const promptsWrap = document.createElement('div');
        promptsWrap.className = 'wai-prompts';
        promptsWrap.id = 'wai-prompts';
        SUGGESTED_PROMPTS.forEach((prompt) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'wai-prompt-chip';
          btn.textContent = prompt;
          btn.addEventListener('click', () => {
            promptsWrap.remove();
            sendUserMessage(prompt);
          });
          promptsWrap.appendChild(btn);
        });
        messagesEl.appendChild(promptsWrap);
      } else {
        history.forEach((msg) => appendBubble(msg.role, msg.text));
      }
      launcher.classList.toggle('has-session', history.length > 0);
      scrollToBottom();
    }

    function renderConsultationCard(prefill = {}) {
      if (leadCardEl && leadCardEl.isConnected) {
        leadCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      const card = document.createElement('div');
      card.className = 'wai-lead-card';
      card.id = 'wai-lead-card';
      leadCardEl = card;

      const selectedSolution =
        SOLUTION_OPTIONS.find(
          (opt) =>
            prefill.solutionInterest &&
            opt.toLowerCase().includes(prefill.solutionInterest.toLowerCase().slice(0, 10))
        ) || SOLUTION_OPTIONS[0];

      card.innerHTML = `
        <div class="wai-lead-head">
          <div>
            <div class="wai-lead-title">Consultation Request</div>
            <p class="wai-lead-sub">Share your details and our team will follow up via email to arrange an assessment.</p>
          </div>
          <button type="button" class="wai-icon-btn wai-lead-dismiss" aria-label="Dismiss consultation form">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <form class="wai-lead-form" novalidate>
          <input type="text" name="website" class="wai-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="wai-field">
            <label for="wai-lead-name">Full name</label>
            <input id="wai-lead-name" name="fullName" type="text" placeholder="Jane Doe" required>
            <span class="wai-field-err" data-err="fullName"></span>
          </div>
          <div class="wai-field">
            <label for="wai-lead-business">Business name</label>
            <input id="wai-lead-business" name="businessName" type="text" placeholder="Acme Hospitality Ltd" required>
            <span class="wai-field-err" data-err="businessName"></span>
          </div>
          <div class="wai-field">
            <label for="wai-lead-email">Email address</label>
            <input id="wai-lead-email" name="email" type="email" placeholder="you@business.com" required>
            <span class="wai-field-err" data-err="email"></span>
          </div>
          <div class="wai-field">
            <label for="wai-lead-industry">Industry</label>
            <input id="wai-lead-industry" name="industry" type="text" placeholder="Restaurants, Retail, Real Estate..." required>
            <span class="wai-field-err" data-err="industry"></span>
          </div>
          <div class="wai-field">
            <label for="wai-lead-solution">Solution interest</label>
            <select id="wai-lead-solution" name="solutionType">
              ${SOLUTION_OPTIONS.map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
            </select>
            <span class="wai-field-err" data-err="solutionType"></span>
          </div>
          <div class="wai-field">
            <label for="wai-lead-outcome">Desired outcome (optional)</label>
            <input id="wai-lead-outcome" name="desiredOutcome" type="text" placeholder="Faster replies, fewer manual tasks...">
          </div>
          <div class="wai-field">
            <label for="wai-lead-challenge">Business challenge</label>
            <textarea id="wai-lead-challenge" name="challenge" placeholder="Briefly describe what you want to automate..." required></textarea>
            <span class="wai-field-err" data-err="challenge"></span>
          </div>
          <label class="wai-consent">
            <input type="checkbox" name="requestCatalogue">
            <span>Also email me the Wisdom Audi Universe Services Catalogue</span>
          </label>
          <label class="wai-consent">
            <input type="checkbox" name="consent" required>
            <span>I consent to Wisdom Audi Universe reviewing these contact details to respond to my enquiry by email. Submitting sends an enquiry rather than booking a live calendar slot.</span>
          </label>
          <span class="wai-field-err" data-err="consent"></span>
          <div class="wai-lead-actions">
            <button type="submit" class="btn btn-solid">Submit Enquiry</button>
          </div>
          <div class="wai-lead-status" role="status" aria-live="polite"></div>
        </form>
      `;

      messagesEl.appendChild(card);

      const industryInput = card.querySelector('#wai-lead-industry');
      const outcomeInput = card.querySelector('#wai-lead-outcome');
      const challengeInput = card.querySelector('#wai-lead-challenge');
      const solutionSelect = card.querySelector('#wai-lead-solution');
      if (industryInput && prefill.industry) industryInput.value = prefill.industry;
      if (outcomeInput && prefill.desiredOutcome) outcomeInput.value = prefill.desiredOutcome;
      if (challengeInput && prefill.challenge) challengeInput.value = prefill.challenge;
      if (solutionSelect) solutionSelect.value = selectedSolution;

      card.querySelector('.wai-lead-dismiss')?.addEventListener('click', () => {
        card.remove();
        leadCardEl = null;
      });

      const leadForm = card.querySelector('.wai-lead-form');
      const statusEl = card.querySelector('.wai-lead-status');
      const submitBtn = leadForm.querySelector('button[type="submit"]');

      leadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitBtn.disabled) return;
        card.querySelectorAll('.wai-field-err').forEach((el) => {
          el.textContent = '';
        });
        statusEl.textContent = '';
        statusEl.classList.remove('is-error');

        const formData = new FormData(leadForm);
        const payload = {
          fullName: String(formData.get('fullName') || '').trim(),
          businessName: String(formData.get('businessName') || '').trim(),
          email: String(formData.get('email') || '').trim(),
          industry: String(formData.get('industry') || '').trim(),
          solutionType: String(formData.get('solutionType') || '').trim(),
          desiredOutcome: String(formData.get('desiredOutcome') || '').trim(),
          interestLevel: String(prefill.interestLevel || '').trim(),
          discoverySummary: String(prefill.discoverySummary || '').trim(),
          challenge: String(formData.get('challenge') || '').trim(),
          requestCatalogue: Boolean(leadForm.querySelector('input[name="requestCatalogue"]')?.checked),
          consent: leadForm.querySelector('input[name="consent"]').checked,
          website: String(formData.get('website') || '')
        };

        let hasErr = false;
        const markErr = (name, msg) => {
          const el = card.querySelector(`[data-err="${name}"]`);
          if (el) el.textContent = msg;
          hasErr = true;
        };

        if (payload.fullName.length < 2) markErr('fullName', 'Please enter your full name.');
        if (payload.businessName.length < 2) markErr('businessName', 'Please enter your business name.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) markErr('email', 'Please enter a valid email address.');
        if (payload.industry.length < 2) markErr('industry', 'Please specify your industry.');
        if (payload.challenge.length < 10) markErr('challenge', 'Please share at least 10 characters.');
        if (!payload.consent) markErr('consent', 'Consent is required before submitting.');

        if (hasErr) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
          const resp = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await resp.json().catch(() => ({}));

          if (resp.status === 409 && data.duplicate && data.referenceId) {
            leadSubmittedRef = data.referenceId;
            card.innerHTML = `
              <div class="wai-lead-title">Already Received (${escapeHtml(leadSubmittedRef)})</div>
              <p class="wai-lead-sub">${escapeHtml(
                data.error || 'This consultation enquiry was already received recently.'
              )}</p>
            `;
            return;
          }

          if (!resp.ok) {
            if (data.fieldErrors && typeof data.fieldErrors === 'object') {
              Object.entries(data.fieldErrors).forEach(([k, msg]) => markErr(k, String(msg)));
            }
            statusEl.textContent = data.error || 'Could not submit your enquiry. Please review the form and try again.';
            statusEl.classList.add('is-error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Enquiry';
            return;
          }

          leadSubmittedRef = data.referenceId || 'SUBMITTED';
          const custStatus = data.notifications?.customerConfirmation?.status || '';
          const agencyStatus = data.notifications?.agencyNotification?.status || '';
          const catStatus = data.notifications?.servicesCatalogue?.status || '';
          const statusMsg =
            data.message ||
            'Your consultation enquiry has been saved for human review.';

          card.innerHTML = `
            <div class="wai-lead-title">Enquiry Sent (${escapeHtml(leadSubmittedRef)})</div>
            <p class="wai-lead-sub">${escapeHtml(statusMsg)}</p>
          `;

          let bubbleText = `Thank you, ${payload.fullName}. Your consultation enquiry (Ref: ${leadSubmittedRef}) has been saved for human review.`;
          if (custStatus === 'sent') {
            bubbleText += ` A confirmation email has been sent to ${payload.email}${catStatus === 'sent' ? ' along with our Services Catalogue' : ''}.`;
          } else if (agencyStatus === 'sent') {
            bubbleText += ` Our team has been notified and will reply to ${payload.email} directly.`;
          } else {
            bubbleText += ` Automated email confirmation could not be delivered yet, but your enquiry is logged for our team to review.`;
          }
          appendBubble('model', bubbleText);
          history.push({
            role: 'model',
            text: `Consultation enquiry submitted cleanly for ${payload.fullName} (${payload.businessName}), reference ${leadSubmittedRef}.`
          });
          saveHistory();
        } catch {
          statusEl.textContent = 'Network issue sending your enquiry. Please try again or email wisdomaudiuniverse@gmail.com.';
          statusEl.classList.add('is-error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Enquiry';
        }
      });

      scrollToBottom();
    }

    function renderCatalogueCard(prefill = {}) {
      if (catalogueCardEl && catalogueCardEl.isConnected) {
        catalogueCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      const card = document.createElement('div');
      card.className = 'wai-lead-card';
      card.id = 'wai-catalogue-card';
      catalogueCardEl = card;

      const selectedFocus =
        SOLUTION_OPTIONS.find(
          (opt) =>
            prefill.focusArea &&
            opt.toLowerCase().includes(prefill.focusArea.toLowerCase().slice(0, 10))
        ) || SOLUTION_OPTIONS[0];

      card.innerHTML = `
        <div class="wai-lead-head">
          <div>
            <div class="wai-lead-title">Email Services Catalogue</div>
            <p class="wai-lead-sub">Receive an overview of our AI automation capabilities, supported industries, and delivery process.</p>
          </div>
          <button type="button" class="wai-icon-btn wai-lead-dismiss" aria-label="Dismiss services catalogue form">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <form class="wai-lead-form" novalidate>
          <input type="text" name="website" class="wai-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="wai-field">
            <label for="wai-cat-name">Your name</label>
            <input id="wai-cat-name" name="fullName" type="text" placeholder="Jane Doe" required>
            <span class="wai-field-err" data-err="fullName"></span>
          </div>
          <div class="wai-field">
            <label for="wai-cat-email">Email address</label>
            <input id="wai-cat-email" name="email" type="email" placeholder="you@business.com" required>
            <span class="wai-field-err" data-err="email"></span>
          </div>
          <div class="wai-field">
            <label for="wai-cat-focus">Primary interest (optional)</label>
            <select id="wai-cat-focus" name="focusArea">
              ${SOLUTION_OPTIONS.map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
            </select>
          </div>
          <div class="wai-field">
            <label for="wai-cat-industry">Industry (optional)</label>
            <input id="wai-cat-industry" name="industry" type="text" placeholder="Restaurants, Retail, Real Estate...">
          </div>
          <label class="wai-consent">
            <input type="checkbox" name="consent" required>
            <span>Please send the Wisdom Audi Universe Services Catalogue to my email address.</span>
          </label>
          <span class="wai-field-err" data-err="consent"></span>
          <div class="wai-lead-actions">
            <button type="submit" class="btn btn-solid">Send Catalogue</button>
          </div>
          <div class="wai-lead-status" role="status" aria-live="polite"></div>
        </form>
      `;

      messagesEl.appendChild(card);

      const industryInput = card.querySelector('#wai-cat-industry');
      const focusSelect = card.querySelector('#wai-cat-focus');
      if (industryInput && prefill.industry) industryInput.value = prefill.industry;
      if (focusSelect) focusSelect.value = selectedFocus;

      card.querySelector('.wai-lead-dismiss')?.addEventListener('click', () => {
        card.remove();
        catalogueCardEl = null;
      });

      const catForm = card.querySelector('.wai-lead-form');
      const statusEl = card.querySelector('.wai-lead-status');
      const submitBtn = catForm.querySelector('button[type="submit"]');

      catForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitBtn.disabled) return;
        card.querySelectorAll('.wai-field-err').forEach((el) => {
          el.textContent = '';
        });
        statusEl.textContent = '';
        statusEl.classList.remove('is-error');

        const formData = new FormData(catForm);
        const payload = {
          fullName: String(formData.get('fullName') || '').trim(),
          email: String(formData.get('email') || '').trim(),
          focusArea: String(formData.get('focusArea') || '').trim(),
          industry: String(formData.get('industry') || '').trim(),
          consent: catForm.querySelector('input[name="consent"]').checked,
          website: String(formData.get('website') || '')
        };

        let hasErr = false;
        const markErr = (name, msg) => {
          const el = card.querySelector(`[data-err="${name}"]`);
          if (el) el.textContent = msg;
          hasErr = true;
        };

        if (payload.fullName.length < 2) markErr('fullName', 'Please enter your name.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) markErr('email', 'Please enter a valid email address.');
        if (!payload.consent) markErr('consent', 'Please confirm consent to receive the email.');
        if (hasErr) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
          const resp = await fetch('/api/catalogue-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await resp.json().catch(() => ({}));

          if (resp.status === 409 && data.duplicate) {
            statusEl.textContent = data.error || 'A catalogue was already sent to this email recently.';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Catalogue';
            return;
          }

          if (!resp.ok) {
            if (data.fieldErrors && typeof data.fieldErrors === 'object') {
              Object.entries(data.fieldErrors).forEach(([k, msg]) => markErr(k, String(msg)));
            }
            statusEl.textContent = data.error || 'Could not deliver the Services Catalogue right now.';
            statusEl.classList.add('is-error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Catalogue';
            return;
          }

          card.innerHTML = `
            <div class="wai-lead-title">Catalogue Sent (${escapeHtml(data.referenceId || 'SENT')})</div>
            <p class="wai-lead-sub">${escapeHtml(
              data.message || `Our Services Catalogue has been emailed to ${payload.email}.`
            )}</p>
          `;
          appendBubble('model', `I've sent the Wisdom Audi Universe Services Catalogue to ${payload.email} (Ref: ${data.referenceId || 'SENT'}).`);
        } catch {
          statusEl.textContent = 'Network issue sending your request. Please try again.';
          statusEl.classList.add('is-error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Catalogue';
        }
      });

      scrollToBottom();
    }

    function updateSendState() {
      sendBtn.disabled = isStreaming || inputEl.value.trim().length === 0;
    }

    function autoResizeInput() {
      inputEl.style.height = 'auto';
      inputEl.style.height = `${Math.min(inputEl.scrollHeight, 108)}px`;
    }

    async function sendUserMessage(rawText, options = {}) {
      const text = String(rawText || '').trim();
      if (!text || isStreaming) return;

      const promptsEl = document.getElementById('wai-prompts');
      if (promptsEl) promptsEl.remove();

      if (!options.skipUserAppend) {
        appendBubble('user', text);
        history.push({ role: 'user', text });
        saveHistory();
      }

      isStreaming = true;
      updateSendState();

      const typingEl = appendTypingBubble();
      let assistantBubble = null;
      let streamedText = '';
      let pendingToolCall = null;
      let pendingCatalogueCall = null;

      activeAbort = new AbortController();

      try {
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-24) }),
          signal: activeAbort.signal
        });

        if (!resp.ok) {
          const errJson = await resp.json().catch(() => ({}));
          throw new Error(errJson.error || `Request failed (${resp.status}).`);
        }

        if (!resp.body) {
          throw new Error('Streaming response is not supported in this browser.');
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processEventBlock = (block) => {
          const lines = block.split(/\r?\n/);
          let eventName = 'message';
          const dataLines = [];
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }
          if (dataLines.length === 0) return;

          let parsed = {};
          try {
            parsed = JSON.parse(dataLines.join('\n'));
          } catch {
            return;
          }

          if (eventName === 'chunk' && typeof parsed.text === 'string') {
            if (!assistantBubble) {
              typingEl.remove();
              assistantBubble = appendBubble('model', '');
            }
            streamedText += parsed.text;
            renderFormattedText(assistantBubble, streamedText);
            scrollToBottom();
          } else if (eventName === 'tool' && parsed.name === 'offer_consultation') {
            pendingToolCall = parsed.args || {};
          } else if (eventName === 'tool' && parsed.name === 'offer_services_catalogue') {
            pendingCatalogueCall = parsed.args || {};
          } else if (eventName === 'error') {
            throw new Error(parsed.message || 'Wisdom AI could not complete the reply.');
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';
          for (const block of blocks) {
            if (block.trim()) processEventBlock(block);
          }
        }
        if (buffer.trim()) {
          processEventBlock(buffer);
        }

        if (typingEl.isConnected) typingEl.remove();

        if (streamedText.trim()) {
          history.push({ role: 'model', text: streamedText.trim() });
          saveHistory();
        }

        if (pendingCatalogueCall) {
          renderCatalogueCard(pendingCatalogueCall);
        }

        if (pendingToolCall) {
          renderConsultationCard(pendingToolCall);
        }
      } catch (err) {
        if (typingEl.isConnected) typingEl.remove();
        if (err?.name !== 'AbortError') {
          appendErrorBanner(
            err?.message || 'Unable to connect to Wisdom AI right now. Please try again.',
            text
          );
        }
      } finally {
        isStreaming = false;
        activeAbort = null;
        updateSendState();
      }
    }

    function setPanelOpen(open) {
      isOpen = open;
      panel.classList.toggle('open', open);
      panel.setAttribute('aria-hidden', String(!open));
      launcher.setAttribute('aria-expanded', String(open));
      if (open) {
        scrollToBottom();
        window.setTimeout(() => inputEl.focus(), 120);
      } else {
        launcher.focus();
      }
    }

    launcher.addEventListener('click', () => setPanelOpen(!isOpen));
    minimizeBtn.addEventListener('click', () => setPanelOpen(false));
    closeBtn.addEventListener('click', () => setPanelOpen(false));

    resetBtn.addEventListener('click', () => {
      if (activeAbort) {
        activeAbort.abort();
        activeAbort = null;
      }
      isStreaming = false;
      history = [];
      leadSubmittedRef = null;
      saveHistory();
      renderInitialThread();
      updateSendState();
      inputEl.focus();
    });

    openConsultBtn.addEventListener('click', () => {
      renderConsultationCard({});
    });

    openCatalogueBtn?.addEventListener('click', () => {
      renderCatalogueCard({});
    });

    inputEl.addEventListener('input', () => {
      autoResizeInput();
      updateSendState();
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
          const val = inputEl.value;
          inputEl.value = '';
          autoResizeInput();
          updateSendState();
          sendUserMessage(val);
        }
      }
    });

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      if (sendBtn.disabled) return;
      const val = inputEl.value;
      inputEl.value = '';
      autoResizeInput();
      updateSendState();
      sendUserMessage(val);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        const modal = document.getElementById('project-modal');
        if (modal && modal.classList.contains('open')) return;
        setPanelOpen(false);
      }
    });

    renderInitialThread();
    updateSendState();
  })();
})();

