import {
  auth,
  getCurrentAdminIdToken,
  signInAdminWithGoogle,
  signOutAdmin,
  subscribeAdminAuthState,
  syncAdminProfileAndAudit
} from './public/admin-firebase.bundle.js';

(() => {
  const loginView = document.getElementById('admin-login-view');
  const appView = document.getElementById('admin-app-view');
  const googleSignInBtn = document.getElementById('firebase-google-signin-btn');
  const loginError = document.getElementById('admin-login-error');
  const adminUserEmailEl = document.getElementById('admin-user-email');
  const logoutBtn = document.getElementById('logout-btn');
  const exportBtn = document.getElementById('export-csv-btn');

  async function adminFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Authorization')) {
      const token = await getCurrentAdminIdToken().catch(() => null);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
    return fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin'
    });
  }

  const viewTabs = Array.from(document.querySelectorAll('.view-tab'));
  const viewLeads = document.getElementById('view-leads');
  const viewPerf = document.getElementById('view-performance');
  const viewEmails = document.getElementById('view-emails');

  const kpiTotal = document.getElementById('kpi-total');
  const kpiNew = document.getElementById('kpi-new');
  const kpiContacted = document.getElementById('kpi-contacted');
  const kpiPipeline = document.getElementById('kpi-pipeline');

  const statusBtns = Array.from(document.querySelectorAll('.seg-btn'));
  const industrySelect = document.getElementById('filter-industry');
  const searchInput = document.getElementById('filter-search');
  const refreshBtn = document.getElementById('refresh-leads-btn');
  const resetFiltersBtn = document.getElementById('reset-filters-btn');

  const leadsTbody = document.getElementById('leads-tbody');
  const leadsEmpty = document.getElementById('leads-empty');
  const leadsErrBanner = document.getElementById('leads-error-banner');

  const inspectorPlaceholder = document.getElementById('inspector-placeholder');
  const inspectorContent = document.getElementById('inspector-content');
  const leadUpdateForm = document.getElementById('lead-update-form');
  const detSaveStatus = document.getElementById('det-save-status');
  const detSaveBtn = document.getElementById('det-save-btn');
  const detDeleteBtn = document.getElementById('det-delete-btn');

  const runBenchmarkBtn = document.getElementById('run-benchmark-btn');
  const benchmarkOutput = document.getElementById('benchmark-output');
  const benchmarkTbody = document.getElementById('benchmark-tbody');
  const metricsTbody = document.getElementById('metrics-tbody');

  const refreshEmailsBtn = document.getElementById('refresh-emails-btn');
  const emailLogsTbody = document.getElementById('email-logs-tbody');
  const emailCfgWarning = document.getElementById('email-cfg-warning');

  let activeStatus = 'all';
  let activeIndustry = 'all';
  let searchQuery = '';
  let leads = [];
  let selectedRef = null;
  let searchDebounce = null;

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setSignedInEmail(email) {
    if (!adminUserEmailEl) return;
    if (email) {
      adminUserEmailEl.textContent = email;
      adminUserEmailEl.hidden = false;
    } else {
      adminUserEmailEl.textContent = '';
      adminUserEmailEl.hidden = true;
    }
  }

  function showAuthGate() {
    appView.hidden = true;
    loginView.hidden = false;
    googleSignInBtn?.focus();
  }

  function showWorkspace() {
    loginView.hidden = true;
    appView.hidden = false;
  }

  function renderLoadingRows() {
    leadsEmpty.hidden = true;
    leadsTbody.innerHTML = Array.from({ length: 4 })
      .map(
        () => `
      <tr>
        <td><div class="skeleton-bar" style="width:76px"></div></td>
        <td><div class="skeleton-bar" style="width:140px"></div></td>
        <td><div class="skeleton-bar" style="width:88px"></div></td>
        <td><div class="skeleton-bar" style="width:130px"></div></td>
        <td><div class="skeleton-bar" style="width:88px"></div></td>
        <td><div class="skeleton-bar" style="width:96px"></div></td>
        <td><div class="skeleton-bar" style="width:64px"></div></td>
      </tr>`
      )
      .join('');
  }

  function selectLead(refId) {
    selectedRef = refId;
    leadsTbody.querySelectorAll('tr').forEach((tr) => {
      tr.classList.toggle('is-selected', tr.dataset.ref === refId);
    });

    const lead = leads.find((l) => l.referenceId === refId);
    if (!lead) {
      inspectorContent.hidden = true;
      inspectorPlaceholder.hidden = false;
      return;
    }

    inspectorPlaceholder.hidden = true;
    inspectorContent.hidden = false;
    detSaveStatus.textContent = '';
    detSaveStatus.classList.remove('is-error');

    document.getElementById('det-ref').textContent = lead.referenceId;
    document.getElementById('det-business').textContent = lead.businessName;
    document.getElementById('det-meta').textContent = `Submitted ${formatDate(lead.submittedAt)} · Updated ${formatDate(lead.updatedAt)}`;
    document.getElementById('det-name').textContent = lead.fullName;

    const emailLink = document.getElementById('det-email');
    emailLink.textContent = lead.email;
    emailLink.href = `mailto:${lead.email}`;

    document.getElementById('det-industry').textContent = lead.industry;
    document.getElementById('det-service').textContent = lead.solutionType;
    document.getElementById('det-interest').textContent = lead.interestLevel ? lead.interestLevel : 'Not specified';

    function formatEmailState(status, detail) {
      if (status === 'sent') return `Sent (${detail || 'Delivered'})`;
      if (status === 'sender_unconfigured') return 'Awaiting SMTP Password / Verified Domain';
      if (status === 'domain_unverified' || status === 'sandbox_restricted') return 'Blocked (Resend domain unverified)';
      if (status === 'recipient_invalid') return 'Blocked (LEAD_NOTIFY_TO invalid)';
      if (status === 'duplicate_prevented') return 'Duplicate prevented';
      if (status === 'failed') return `Failed (${detail || 'check logs'})`;
      if (status === 'not_configured') return 'Awaiting configuration';
      if (!status || status === 'skipped') return 'Not requested';
      return status;
    }

    document.getElementById('det-notify').textContent = formatEmailState(
      lead.notificationStatus,
      lead.notificationDetail
    );
    const custNotifyEl = document.getElementById('det-cust-notify');
    if (custNotifyEl) {
      custNotifyEl.textContent = formatEmailState(lead.customerEmailStatus, lead.customerEmailDetail);
    }
    const catNotifyEl = document.getElementById('det-cat-notify');
    if (catNotifyEl) {
      catNotifyEl.textContent = formatEmailState(lead.catalogueEmailStatus, lead.catalogueEmailDetail);
    }

    document.getElementById('det-challenge').textContent = lead.challenge;

    const outcomeWrap = document.getElementById('det-outcome-wrap');
    if (lead.desiredOutcome) {
      document.getElementById('det-outcome').textContent = lead.desiredOutcome;
      outcomeWrap.hidden = false;
    } else {
      outcomeWrap.hidden = true;
    }

    const discWrap = document.getElementById('det-discovery-wrap');
    if (lead.discoverySummary) {
      document.getElementById('det-discovery').textContent = lead.discoverySummary;
      discWrap.hidden = false;
    } else {
      discWrap.hidden = true;
    }

    document.getElementById('det-status-select').value = lead.status || 'new';
    document.getElementById('det-notes-input').value = lead.followUpNotes || '';

    const mailtoSubject = encodeURIComponent(`Re: Wisdom Audi Universe Consultation (${lead.referenceId})`);
    document.getElementById('det-mailto-btn').href = `mailto:${lead.email}?subject=${mailtoSubject}`;
  }

  function renderLeadsTable() {
    if (leads.length === 0) {
      leadsTbody.innerHTML = '';
      leadsEmpty.hidden = false;
      selectLead(null);
      return;
    }

    function summarizeRowEmail(lead) {
      const cust = lead.customerEmailStatus || 'pending';
      const ag = lead.notificationStatus || 'pending';
      if (cust === 'sent' && ag === 'sent') return 'Both Sent';
      if (cust === 'sent') return ag === 'recipient_invalid' ? 'Cust Only (Inbox Invalid)' : 'Cust Sent';
      if (ag === 'sent') return 'Agency Only';
      if (cust === 'sender_unconfigured') return 'Awaiting SMTP/Domain';
      if (cust === 'domain_unverified' || cust === 'sandbox_restricted') return 'Domain Unverified';
      if (ag === 'recipient_invalid') return 'Inbox Invalid';
      if (cust === 'failed' || ag === 'failed') return 'Failed';
      if (cust === 'not_configured') return 'Unconfigured';
      return cust;
    }

    leadsEmpty.hidden = true;
    leadsTbody.innerHTML = leads
      .map(
        (lead) => `
      <tr data-ref="${escapeHtml(lead.referenceId)}" class="${lead.referenceId === selectedRef ? 'is-selected' : ''}">
        <td class="mono-ref tabular-nums">${escapeHtml(lead.referenceId)}</td>
        <td>
          <div class="cell-primary">${escapeHtml(lead.businessName)}</div>
          <div class="cell-sub">${escapeHtml(lead.fullName)} · ${escapeHtml(lead.email)}</div>
        </td>
        <td>${escapeHtml(lead.industry)}</td>
        <td>${escapeHtml(lead.solutionType)}</td>
        <td class="mono-ref">${escapeHtml(summarizeRowEmail(lead))}</td>
        <td class="cell-sub tabular-nums">${escapeHtml(formatDate(lead.submittedAt))}</td>
        <td><span class="status-text is-${escapeHtml(lead.status)}">${escapeHtml(lead.status)}</span></td>
      </tr>`
      )
      .join('');

    leadsTbody.querySelectorAll('tr').forEach((row) => {
      row.addEventListener('click', () => selectLead(row.dataset.ref));
    });

    if (selectedRef && leads.some((l) => l.referenceId === selectedRef)) {
      selectLead(selectedRef);
    } else if (leads.length > 0) {
      selectLead(leads[0].referenceId);
    }
  }

  async function loadLeads() {
    leadsErrBanner.hidden = true;
    renderLoadingRows();

    const params = new URLSearchParams();
    if (activeStatus !== 'all') params.set('status', activeStatus);
    if (activeIndustry !== 'all') params.set('industry', activeIndustry);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());

    try {
      const resp = await adminFetch(`/api/admin/leads?${params.toString()}`);
      if (resp.status === 401 || resp.status === 403) {
        showAuthGate();
        return;
      }
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to load enquiries.');
      }

      const ov = data.overview || {};
      kpiTotal.textContent = String(ov.total ?? 0);
      kpiNew.textContent = String(ov.newCount ?? 0);
      kpiContacted.textContent = String(ov.contactedCount ?? 0);
      kpiPipeline.textContent = String(ov.activePipelineCount ?? 0);

      const currentVal = industrySelect.value || 'all';
      const industries = Array.isArray(ov.industries) ? ov.industries : [];
      industrySelect.innerHTML =
        '<option value="all">All industries</option>' +
        industries.map((ind) => `<option value="${escapeHtml(ind)}">${escapeHtml(ind)}</option>`).join('');
      industrySelect.value = industries.includes(currentVal) ? currentVal : 'all';

      leads = Array.isArray(data.leads) ? data.leads : [];
      renderLeadsTable();
    } catch (err) {
      leadsTbody.innerHTML = '';
      leadsErrBanner.textContent = err?.message || 'Unable to load leads right now.';
      leadsErrBanner.hidden = false;
    }
  }

  async function loadMetrics() {
    try {
      const resp = await adminFetch('/api/admin/metrics');
      if (resp.status === 401 || resp.status === 403) {
        showAuthGate();
        return;
      }
      const data = await resp.json();
      if (!resp.ok) return;

      document.getElementById('perf-primary').textContent = data.primaryModel || '—';
      document.getElementById('perf-ttft').textContent = data.avgTtftMs != null ? `${data.avgTtftMs} ms` : '—';
      document.getElementById('perf-total').textContent = data.avgTotalMs != null ? `${data.avgTotalMs} ms` : '—';
      document.getElementById('perf-fallbacks').textContent = String(data.fallbackCount ?? 0);

      const recent = Array.isArray(data.recent) ? data.recent : [];
      if (recent.length === 0) {
        metricsTbody.innerHTML = '<tr><td colspan="7" class="cell-sub">No chat metrics recorded yet.</td></tr>';
        return;
      }

      metricsTbody.innerHTML = recent
        .map(
          (row) => `
        <tr>
          <td class="cell-sub tabular-nums">${escapeHtml(formatDate(row.createdAt))}</td>
          <td class="mono-ref">${escapeHtml(row.model)}${row.fallbackUsed ? ' (fallback)' : ''}</td>
          <td class="mono-ref">${escapeHtml(row.thinkingLevel)}</td>
          <td class="tabular-nums">${row.ttftMs != null ? `${row.ttftMs} ms` : '—'}</td>
          <td class="tabular-nums">${row.totalMs} ms</td>
          <td class="mono-ref">${escapeHtml(row.toolCalled || '—')}</td>
          <td><span class="status-text">${escapeHtml(row.outcome)}</span></td>
        </tr>`
        )
        .join('');
    } catch {
      // Non-fatal
    }
  }

  async function loadEmailStatus(forceRefresh = false) {
    try {
      const resp = await adminFetch(`/api/admin/email-status${forceRefresh ? '?refresh=1' : ''}`);
      if (resp.status === 401 || resp.status === 403) {
        showAuthGate();
        return;
      }
      const data = await resp.json();
      if (!resp.ok) return;

      const cfg = data.config || {};
      const dom = data.resendDomains || {};
      const activeSender =
        cfg.activeTransport === 'resend'
          ? cfg.fromAddress
          : cfg.gmailSmtpReady || !cfg.fromAddress
          ? cfg.gmailSmtpUser
          : `${cfg.gmailSmtpUser} (Gmail SMTP)`;
      document.getElementById('email-cfg-from').textContent = activeSender || '(Unset)';
      document.getElementById('email-cfg-to').textContent = cfg.agencyNotifyTo || '(Unset)';

      let modeLabel = 'Awaiting Configuration';
      if (cfg.activeTransport === 'resend') {
        modeLabel =
          dom.status === 'ok' && dom.verifiedSenderDomain
            ? 'Resend (Verified Domain Active)'
            : dom.status === 'ok' && !dom.verifiedSenderDomain
            ? 'Resend (Domain Pending)'
            : 'Resend (Custom Domain)';
      } else if (cfg.activeTransport === 'gmail_smtp') {
        modeLabel = 'Gmail SMTP Active';
      } else if (cfg.activeTransport === 'smtp') {
        modeLabel = 'SMTP Relay Active';
      } else if (!cfg.gmailSmtpPasswordConfigured) {
        modeLabel = 'Awaiting GMAIL_SMTP_APP_PASSWORD';
      } else if (cfg.resendConfigured && !cfg.senderValid) {
        modeLabel = 'Blocked (Verified Domain Required)';
      }
      document.getElementById('email-cfg-mode').textContent = modeLabel;
      document.getElementById('email-cfg-retention').textContent = `${data.retentionDays || 365} days`;

      const warnings = [];
      if (!cfg.publicSendingEnabled) {
        if (!cfg.gmailSmtpPasswordConfigured) {
          warnings.push(
            `Gmail SMTP identity (${cfg.gmailSmtpUser}) is ready and awaiting GMAIL_SMTP_APP_PASSWORD in server Secrets.`
          );
        }
        if (cfg.resendConfigured && !cfg.senderValid && cfg.senderReason) {
          warnings.push(cfg.senderReason);
        }
      }
      if (cfg.agencyNotifyEnvNeedsUpdate && cfg.agencyRecipientReason) {
        warnings.push(cfg.agencyRecipientReason);
      }
      if (cfg.activeTransport === 'resend' && dom.status === 'ok' && !dom.verifiedSenderDomain) {
        const domainList = (dom.domains || []).map((d) => `${d.name} (${d.status})`).join(', ') || 'none';
        warnings.push(
          `Resend domain verification check: "${cfg.fromDomain}" is not verified yet in Resend (account domains: ${domainList}).`
        );
      }

      if (warnings.length > 0) {
        emailCfgWarning.textContent = warnings.join(' ');
        emailCfgWarning.hidden = false;
      } else {
        emailCfgWarning.hidden = true;
      }

      const logs = Array.isArray(data.logs) ? data.logs : [];
      if (logs.length === 0) {
        emailLogsTbody.innerHTML = '<tr><td colspan="7" class="cell-sub">No email delivery logs recorded yet.</td></tr>';
        return;
      }

      emailLogsTbody.innerHTML = logs
        .map(
          (row) => `
        <tr>
          <td class="cell-sub tabular-nums">${escapeHtml(formatDate(row.createdAt))}</td>
          <td class="mono-ref">${escapeHtml(row.referenceId)}</td>
          <td class="mono-ref">${escapeHtml(row.emailType)}</td>
          <td>${escapeHtml(row.recipient)}</td>
          <td><span class="status-text">${escapeHtml(row.status)}</span></td>
          <td class="mono-ref">${escapeHtml(row.providerId || '—')}</td>
          <td class="cell-sub">${escapeHtml(row.detail || '—')}</td>
        </tr>`
        )
        .join('');
    } catch {
      // Non-fatal
    }
  }

  async function exchangeFirebaseSession(idToken) {
    const resp = await fetch('/api/admin/firebase-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ idToken })
    });
    const data = await resp.json().catch(() => ({}));
    return { resp, data };
  }

  function formatFirebaseAuthError(err) {
    const code = String(err?.code || '');
    if (code === 'auth/popup-closed-by-user') {
      return 'Google sign-in popup was closed before completing authentication.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Popup was blocked by your browser. Please allow popups for this site and try again.';
    }
    if (code === 'auth/cancelled-popup-request') {
      return 'Sign-in request was cancelled. Please try again.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'This domain is not yet allowlisted in Firebase Authentication settings.';
    }
    return err?.message || 'Unable to complete Firebase Google authentication.';
  }

  const defaultGoogleBtnHtml = googleSignInBtn ? googleSignInBtn.innerHTML : '';

  googleSignInBtn?.addEventListener('click', async () => {
    loginError.textContent = '';
    googleSignInBtn.disabled = true;
    const labelSpan = googleSignInBtn.querySelector('span');
    if (labelSpan) labelSpan.textContent = 'Signing in with Google...';

    try {
      const { user, idToken } = await signInAdminWithGoogle();
      const { resp, data } = await exchangeFirebaseSession(idToken);
      if (!resp.ok) {
        await signOutAdmin().catch(() => {});
        setSignedInEmail('');
        loginError.textContent = data.error || 'This Google account is not authorized for admin access.';
        return;
      }

      setSignedInEmail(data.admin?.email || user.email || '');
      showWorkspace();
      await Promise.all([loadLeads(), loadMetrics(), loadEmailStatus()]);
      void syncAdminProfileAndAudit(user, 'login').catch(() => {});
    } catch (err) {
      loginError.textContent = formatFirebaseAuthError(err);
    } finally {
      googleSignInBtn.disabled = false;
      if (defaultGoogleBtnHtml) googleSignInBtn.innerHTML = defaultGoogleBtnHtml;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      await syncAdminProfileAndAudit(currentUser, 'logout').catch(() => {});
    }
    await signOutAdmin().catch(() => {});
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    selectedRef = null;
    leads = [];
    setSignedInEmail('');
    showAuthGate();
  });

  exportBtn.addEventListener('click', () => {
    const params = new URLSearchParams();
    if (activeStatus !== 'all') params.set('status', activeStatus);
    if (activeIndustry !== 'all') params.set('industry', activeIndustry);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    window.location.href = `/api/admin/leads/export?${params.toString()}`;
  });

  viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      viewTabs.forEach((t) => t.classList.toggle('active', t === tab));
      const target = tab.dataset.view;
      viewLeads.hidden = target !== 'leads';
      viewPerf.hidden = target !== 'performance';
      if (viewEmails) viewEmails.hidden = target !== 'emails';
      if (target === 'performance') loadMetrics();
      if (target === 'emails') loadEmailStatus();
    });
  });

  statusBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      statusBtns.forEach((b) => b.classList.toggle('active', b === btn));
      activeStatus = btn.dataset.status || 'all';
      loadLeads();
    });
  });

  industrySelect.addEventListener('change', () => {
    activeIndustry = industrySelect.value || 'all';
    loadLeads();
  });

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(loadLeads, 220);
  });

  refreshBtn.addEventListener('click', () => {
    loadLeads();
    loadMetrics();
    loadEmailStatus();
  });

  refreshEmailsBtn?.addEventListener('click', () => {
    loadEmailStatus(true);
  });

  resetFiltersBtn.addEventListener('click', () => {
    activeStatus = 'all';
    activeIndustry = 'all';
    searchQuery = '';
    searchInput.value = '';
    industrySelect.value = 'all';
    statusBtns.forEach((b) => b.classList.toggle('active', b.dataset.status === 'all'));
    loadLeads();
  });

  leadUpdateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedRef) return;

    const status = document.getElementById('det-status-select').value;
    const followUpNotes = document.getElementById('det-notes-input').value;

    detSaveBtn.disabled = true;
    detSaveBtn.textContent = 'Saving...';
    detSaveStatus.textContent = '';
    detSaveStatus.classList.remove('is-error');

    try {
      const resp = await adminFetch(`/api/admin/leads/${encodeURIComponent(selectedRef)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, followUpNotes })
      });
      if (resp.status === 401 || resp.status === 403) {
        showAuthGate();
        return;
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || 'Could not update lead.');
      }

      detSaveStatus.textContent = 'Saved.';
      await loadLeads();
    } catch (err) {
      detSaveStatus.textContent = err?.message || 'Error saving changes.';
      detSaveStatus.classList.add('is-error');
    } finally {
      detSaveBtn.disabled = false;
      detSaveBtn.textContent = 'Save Changes';
    }
  });

  detDeleteBtn.addEventListener('click', async () => {
    if (!selectedRef) return;
    if (detDeleteBtn.dataset.confirm !== selectedRef) {
      detDeleteBtn.dataset.confirm = selectedRef;
      detDeleteBtn.textContent = 'Confirm Delete';
      window.setTimeout(() => {
        detDeleteBtn.dataset.confirm = '';
        detDeleteBtn.textContent = 'Delete';
      }, 3500);
      return;
    }

    detDeleteBtn.disabled = true;
    try {
      const resp = await adminFetch(`/api/admin/leads/${encodeURIComponent(selectedRef)}`, {
        method: 'DELETE'
      });
      if (resp.status === 401 || resp.status === 403) {
        showAuthGate();
        return;
      }
      if (resp.ok) {
        selectedRef = null;
        await loadLeads();
      }
    } finally {
      detDeleteBtn.disabled = false;
      detDeleteBtn.dataset.confirm = '';
      detDeleteBtn.textContent = 'Delete';
    }
  });

  runBenchmarkBtn.addEventListener('click', async () => {
    runBenchmarkBtn.disabled = true;
    runBenchmarkBtn.textContent = 'Running...';
    try {
      const resp = await adminFetch('/api/admin/benchmark', { method: 'POST' });
      if (resp.status === 401 || resp.status === 403) {
        showAuthGate();
        return;
      }
      const data = await resp.json();
      const rows = Array.isArray(data.results) ? data.results : [];
      benchmarkOutput.hidden = false;
      benchmarkTbody.innerHTML = rows
        .map(
          (r) => `
        <tr>
          <td class="mono-ref">${escapeHtml(r.model)}</td>
          <td class="mono-ref">${escapeHtml(r.thinkingLevel)}</td>
          <td>${r.includeTool ? `Yes (${escapeHtml(r.toolDetected || 'none')})` : 'No'}</td>
          <td><span class="status-text">${r.ok ? 'Pass' : `Fail (${escapeHtml(r.status)})`}</span></td>
          <td class="tabular-nums">${r.ttftMs != null ? `${r.ttftMs} ms` : '—'}</td>
          <td class="tabular-nums">${r.totalMs} ms</td>
        </tr>`
        )
        .join('');
    } finally {
      runBenchmarkBtn.disabled = false;
      runBenchmarkBtn.textContent = 'Run Live Benchmark';
    }
  });

  let workspaceBootstrapped = false;

  async function enterAuthenticatedWorkspace(email) {
    setSignedInEmail(email || '');
    showWorkspace();
    if (!workspaceBootstrapped) {
      workspaceBootstrapped = true;
      await Promise.all([loadLeads(), loadMetrics(), loadEmailStatus()]);
    }
  }

  subscribeAdminAuthState((user) => {
    if (user && !workspaceBootstrapped) {
      void (async () => {
        try {
          const idToken = await user.getIdToken();
          const { resp, data } = await exchangeFirebaseSession(idToken);
          if (resp.ok) {
            await enterAuthenticatedWorkspace(data.admin?.email || user.email || '');
            return;
          }
          await signOutAdmin().catch(() => {});
          loginError.textContent = data.error || 'This Google account is not authorized for admin access.';
        } catch {
          // Leave on auth gate
        }
        showAuthGate();
      })();
    } else if (!user && workspaceBootstrapped) {
      workspaceBootstrapped = false;
      setSignedInEmail('');
      showAuthGate();
    }
  });

  (async function bootstrap() {
    try {
      const resp = await adminFetch('/api/admin/session');
      const data = await resp.json().catch(() => ({}));
      if (data.authenticated) {
        await enterAuthenticatedWorkspace(data.admin?.email || auth.currentUser?.email || '');
      } else {
        showAuthGate();
      }
    } catch {
      showAuthGate();
    }
  })();
})();
