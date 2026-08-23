function setSafeText(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; }
function setSafeHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

function spawnCombatText(targetElem, text, type = 'hit') {
  if (!targetElem) return;
  const rect = targetElem.getBoundingClientRect();
  const fct = document.createElement('div');
  fct.className = `fct-item fct-${type}`;
  fct.innerText = text;

  const offsetX = (Math.random() - 0.5) * 30;
  const offsetY = (Math.random() - 0.5) * 10;

  fct.style.position = 'fixed';
  fct.style.left = `${rect.left + rect.width / 2 + offsetX}px`;
  fct.style.top = `${rect.top + rect.height / 3 + offsetY}px`;

  document.body.appendChild(fct);
  setTimeout(() => { if (fct.parentNode) fct.remove(); }, 850);
}

function triggerScreenShake(intensity = 'sm') {
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.remove('shake-sm', 'shake-lg');
  void app.offsetWidth;
  app.classList.add(intensity === 'lg' ? 'shake-lg' : 'shake-sm');
  setTimeout(() => app.classList.remove('shake-sm', 'shake-lg'), 350);
}

function triggerDamageFlash() {
  const flash = document.createElement('div');
  flash.className = 'screen-flash';
  document.body.appendChild(flash);
  setTimeout(() => { if (flash.parentNode) flash.remove(); }, 300);
}

function addLog(msg, css = '') {
  const log = document.getElementById('combat-log');
  if (!log) return;
  const d = document.createElement('div');
  d.className = `log-row ${css}`; d.innerHTML = msg;
  log.appendChild(d); log.scrollTop = log.scrollHeight;
}

function switchTab(tab) {
  Sound.play('click');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('#main-nav button').forEach(b => b.classList.remove('active'));
  const view = document.getElementById(`view-${tab}`);
  if (view) view.classList.add('active');
  const target = document.querySelector(`#main-nav button[data-tab="${tab}"]`);
  if (target) target.classList.add('active');
}

function openSynthesisModal() {
  Sound.play('click');
  renderSynthesisUI();
  document.getElementById('synthesis-modal').style.display = 'flex';
}

function closeSynthesisModal(e) {
  if (!e || e.target.id === 'synthesis-modal') {
    Sound.play('click');
    document.getElementById('synthesis-modal').style.display = 'none';
  }
}

function renderSynthesisUI() {
  setSafeText('synth-dust-val', player.synthDust || 0);

  const runesContainer = document.getElementById('runes-storage-list');
  if (runesContainer) {
    runesContainer.innerHTML = '';
    if (!player.storedRunes || player.storedRunes.length === 0) {
      runesContainer.innerHTML = '<span style="font-size:9px; color:var(--text-muted);">Нет рун в хранилище.</span>';
    } else {
      player.storedRunes.forEach((rId, idx) => {
        const r = RUNES_DB.find(x => x.id === rId);
        if (!r) return;
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-rune';
        btn.title = r.desc;
        btn.innerHTML = `${r.icon} ${r.name} (Вставить)`;
        btn.onclick = () => inlayRune(idx);
        runesContainer.appendChild(btn);
      });
    }
  }

  const salvageContainer = document.getElementById('salvage-items-list');
  if (salvageContainer) {
    salvageContainer.innerHTML = '';
    const eligible = player.inventory.map((it, idx) => ({ item: it, originalIndex: idx })).filter(x => x.item.quality >= 5);
    if (eligible.length === 0) {
      salvageContainer.innerHTML = '<span style="font-size:9px; color:var(--text-muted);">Нет предметов качества V+ для распыления.</span>';
    } else {
      eligible.forEach(x => {
        const q = QUALITIES[x.item.quality] || QUALITIES[1];
        const dustReward = (x.item.quality - 4) * 10 + (x.item.stars || 0) * 5;
        const row = document.createElement('div');
        row.className = 'stat-card';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.marginBottom = '4px';
        row.innerHTML = `
          <div>
            <b class="${q.cls}">${x.item.fullName}</b>
            <div style="font-size:8px; color:var(--text-muted);">${q.name} | [${SLOTS[x.item.slot]}] | +${dustReward} ✨</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="salvageItem(${x.originalIndex})">Растворить (+${dustReward} ✨)</button>
        `;
        salvageContainer.appendChild(row);
      });
    }
  }
}

function showItemTooltip(e, item) {
  const q = QUALITIES[item.quality] || QUALITIES[1];
  const slotName = SLOTS[item.slot] || item.slot;
  const tip = document.getElementById('item-tooltip');
  if (!tip) return;

  const usable = isItemUsable(item);
  const isBypassed = player.transcendLevel >= 1 && player.heritageBypassSlot === item.slot;
  const equipped = player.equipment[item.slot];
  let compareHtml = '';
  if (equipped && equipped !== item) {
    const totalItemCurse = (item.curseChance || 0) + (item.baseCurseChance || 0);
    const totalEqCurse = (equipped.curseChance || 0) + (equipped.baseCurseChance || 0);

    const statsToCheck = [
      { label: '⚔ Атк', valA: item.atk, valB: equipped.atk },
      { label: '🛡 Защ', valA: item.def, valB: equipped.def },
      { label: '❤️ HP', valA: item.hp, valB: equipped.hp },
      { label: '⚡ ASPD', isPct: true, valA: item.aspd, valB: equipped.aspd },
      { label: '🎯 Крит', isPct: true, valA: item.crit, valB: equipped.crit },
      { label: '💥 К.Урон', isPct: true, valA: item.critDmg, valB: equipped.critDmg },
      { label: '🩸 Вампир', isPct: true, valA: item.vamp, valB: equipped.vamp },
      { label: '🗡 Пробой', valA: item.pierce, valB: equipped.pierce },
      { label: '🛡 Срез', isPct: true, valA: item.dmgReduction, valB: equipped.dmgReduction },
      { label: '✨ Сила умений', isPct: true, valA: item.skillPower, valB: equipped.skillPower },
      { label: '🔮 Проклятье', isPct: true, valA: totalItemCurse, valB: totalEqCurse }
    ];

    let lines = [];
    statsToCheck.forEach(st => {
      const diff = (st.valA || 0) - (st.valB || 0);
      if (diff !== 0) {
        lines.push(`<span style="font-size:8.5px;">${st.label}: <b class="${diff>0?'compare-pos':'compare-neg'}">${diff>0?'+':''}${diff}${st.isPct?'%':''}</b></span>`);
      }
    });
    compareHtml = `<div style="border-top:1px dashed var(--border-highlight); margin-top:4px; padding-top:2px;"><div style="font-size:8.5px; color:var(--gold);">⚖ Сравнение: ${equipped.fullName}</div><div style="display:flex; flex-wrap:wrap; gap:3px;">${lines.join(' | ')}</div></div>`;
  }

  let runesHtml = (item.runes && item.runes.length > 0)
    ? `<div style="color:#d8b4fe; font-size:8.5px;">Руны: ${item.runes.map(rId => RUNES_DB.find(x=>x.id===rId).name).join(', ')}</div>` : '';

  let affixesHtml = (item.affixes && item.affixes.length > 0)
    ? item.affixes.map(a => `<div style="color:#d8b4fe; font-size:8px;">• ${a}</div>`).join('') : '<div style="color:var(--text-muted); font-size:8px;">Нет аффиксов</div>';

  const chances = getForgeChances(item);

  tip.innerHTML = `
    <div style="font-weight:800; font-size:11px;" class="${q.cls}">${item.fullName} ${item.stars ? `[★x${item.stars}]` : ''}</div>
    <div style="font-size:8.5px; color:var(--text-muted); display:flex; justify-content:space-between;"><span>${q.name}</span><span>[${slotName}]</span></div>
    <div style="font-size:9.5px; font-weight:bold; margin-top:2px; color:${usable ? '#34d399' : '#f87171'};">
      🔒 Треб. уровень: Ур. ${item.reqLvl || 1} ${isBypassed ? '📜 (Связь Времен ✓)' : (!usable ? '❌ (БЛОКИРОВАНО)' : '✓')}
    </div>
    <div style="font-size:9px; font-weight:bold; color:${item.baseCurseChance>=0?'#f43f5e':'#38bdf8'};">🔮 Проклятье: ${item.baseCurseChance>=0?'+':''}${item.baseCurseChance}%</div>
    ${runesHtml}
    <div style="border-top:1px solid var(--border); padding-top:2px; margin-top:2px;">${affixesHtml}</div>
    ${compareHtml}
    <div style="border-top:1px solid var(--border); padding-top:2px; margin-top:3px; font-size:8.5px; color:var(--gold);">
      🪙 ${item.price.toLocaleString()} Зл. | ⭐ Закалка: ${getForgeCost(item).toLocaleString()} Зл.<br>
      <span style="color:#cbd5e1;">Шансы: <b style="color:#34d399;">✓ ${chances.success}%</b> ${chances.fail ? `| <b style="color:#f59e0b;">⚠ ${chances.fail}%</b>` : ''} ${chances.break ? `| <b style="color:#f87171;">💥 ${chances.break}%</b>` : ''}</span>
    </div>
  `;
  tip.style.display = 'block';
  moveItemTooltip(e);
}

function moveItemTooltip(e) {
  const tip = document.getElementById('item-tooltip');
  if (!tip || tip.style.display === 'none') return;
  let x = e.clientX + 10, y = e.clientY + 10;
  if (x + 290 > window.innerWidth) x = e.clientX - 290;
  if (y + 220 > window.innerHeight) y = e.clientY - 220;
  tip.style.left = `${Math.max(5, x)}px`; tip.style.top = `${Math.max(5, y)}px`;
}

function hideItemTooltip() { document.getElementById('item-tooltip').style.display = 'none'; }

function renderEquipment() {
  const container = document.getElementById('gear-list');
  if (!container) return;
  container.innerHTML = '';
  const transLvl = player.transcendLevel || 0;

  for (let s in SLOTS) {
    const item = player.equipment[s];
    const unlocked = isSlotUnlocked(s);
    const reqPrestige = SLOT_UNLOCK_PRESTIGE[s] || 0;
    const card = document.createElement('div');

    if (!unlocked) {
      // Слот заблокирован престижем
      card.className = 'gear-card locked';
      card.style.opacity = '0.5';
      card.style.background = 'rgba(10, 6, 16, 0.4)';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b style="font-size:10.5px; color:#f87171;">🔒 ${SLOTS[s]}</b>
          <span style="font-size:8.5px; color:#f87171; font-weight:bold;">Престиж ${reqPrestige}</span>
        </div>
        <div style="font-size:9px; color:var(--text-muted); margin-top:4px;">Слот заблокирован Возвышением.</div>
      `;
    } else if (item) {
      // Слот разблокирован и занят предметом
      const usable = isItemUsable(item);
      const q = QUALITIES[item.quality] || QUALITIES[1];
      card.className = `gear-card ${q.cls}`;
      card.onmouseenter = (e) => showItemTooltip(e, item);
      card.onmousemove = (e) => moveItemTooltip(e);
      card.onmouseleave = hideItemTooltip;
      card.innerHTML = `
        <div class="item-header">
          <span class="item-title ${q.cls}">${item.fullName}</span>
          <span class="item-rarity-pill ${q.bg}">${SLOTS[s]}</span>
        </div>
        <div class="affix-container">
          <span class="affix-chip ${usable ? '' : 'lvl-chip'}">🔒 Ур. ${item.reqLvl || 1}</span>
          ${item.stars ? `<span class="affix-chip star-chip">★x${item.stars}</span>` : ''}
          ${(item.runes||[]).map(rId => `<span class="affix-chip rune-chip">${RUNES_DB.find(x=>x.id===rId).icon}</span>`).join('')}
          ${item.atk ? `<span class="affix-chip">⚔ +${item.atk.toLocaleString()}</span>` : ''}
          ${item.def ? `<span class="affix-chip">🛡 +${item.def.toLocaleString()}</span>` : ''}
          ${item.hp ? `<span class="affix-chip">❤️ +${item.hp.toLocaleString()}</span>` : ''}
        </div>
        ${!usable ? `<div class="item-disabled-badge">⚠️ [УРОВЕНЬ МАЛ: 0 БОНУСОВ]</div>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
          <button class="btn btn-sm btn-forge" onclick="forgeItem(player.equipment['${s}'], '${s}')">⭐ Закалить</button>
          <button class="btn btn-sm btn-danger" onclick="unequipItem('${s}')">Снять</button>
        </div>
      `;
    } else {
      // Слот разблокирован, но свободен
      card.className = 'gear-card empty';
      card.innerHTML = `<div style="font-size:10px; color:var(--text-muted);">${SLOTS[s]}: <i>Свободно</i></div>`;
    }
    container.appendChild(card);
  }
}

function renderInventory() {
  const container = document.getElementById('inventory-list');
  if (!container) return;
  container.innerHTML = '';
  if (player.inventory.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:10px; text-align:center; padding:15px 0;">Инвентарь пуст.</div>';
    return;
  }
  player.inventory.forEach((item, idx) => {
    const usable = isItemUsable(item);
    const q = QUALITIES[item.quality] || QUALITIES[1];
    const card = document.createElement('div');
    card.className = `item-card ${q.cls}`;
    card.onmouseenter = (e) => showItemTooltip(e, item);
    card.onmousemove = (e) => moveItemTooltip(e);
    card.onmouseleave = hideItemTooltip;
    card.innerHTML = `
      <div class="item-header">
        <span class="item-title ${q.cls}">${item.fullName}</span>
        <span class="item-rarity-pill ${q.bg}">${SLOTS[item.slot]}</span>
      </div>
      <div class="affix-container">
        <span class="affix-chip ${usable ? '' : 'lvl-chip'}">🔒 Ур. ${item.reqLvl || 1}</span>
        ${item.stars ? `<span class="affix-chip star-chip">★x${item.stars}</span>` : ''}
        ${item.atk ? `<span class="affix-chip">⚔ +${item.atk.toLocaleString()}</span>` : ''}
        ${item.hp ? `<span class="affix-chip">❤️ +${item.hp.toLocaleString()}</span>` : ''}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
        <span style="font-size:9px; color:var(--gold);">🪙 ${item.price.toLocaleString()}</span>
        <div style="display:flex; gap:3px;">
          <button class="btn btn-sm btn-forge" onclick="forgeItem(player.inventory[${idx}])">⭐</button>
          <button class="btn btn-sm" onclick="equipItem(${idx})" ${!usable ? 'disabled title="Уровень слишком мал!"' : ''}>
            ${usable ? 'Надеть' : 'Мало Ур.'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="sellItem(${idx})">Продать</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderSkillsManager() {
  const container = document.getElementById('skills-manager-list');
  if (!container) return;
  container.innerHTML = '';
  document.getElementById('equipped-skills-count').innerText = `${player.equippedSkills.length}/3`;
  for (let sId in SKILLS_DB) {
    const sk = SKILLS_DB[sId];
    if (!player.skills[sId]) player.skills[sId] = { lvl: 1 };
    const sData = player.skills[sId];
    const isEquipped = player.equippedSkills.includes(sId);
    const isAwk = !!(player.awakenedSkills && player.awakenedSkills[sId]);
    const card = document.createElement('div');
    card.className = 'skill-manager-card';
    card.innerHTML = `
      <div>
        <div style="display:flex; align-items:center; gap:4px;">
          <b style="font-size:11px; color:#fff;">${sk.icon} ${sk.name}</b>
          <span style="font-size:9px; color:var(--accent);">[Ур. ${sData.lvl}/5]</span>
          ${isEquipped ? `<span class="skill-equipped-badge">В БОЮ</span>` : ''}
          ${isAwk ? `<span class="skill-awakened-badge">ПРОБУЖДЁН</span>` : ''}
        </div>
        <div style="font-size:9px; color:var(--text-muted);">${sk.desc}</div>
      </div>
      <div style="display:flex; gap:3px;">
        ${sData.lvl >= 5 && !isAwk ? `<button class="btn btn-sm btn-awakened" onclick="awakenSkill('${sId}')">✨ Пробудить</button>` : ''}
        <button class="btn btn-sm" onclick="upgradeSkill('${sId}')" ${sData.lvl >= 5 ? 'disabled' : ''}>+ TP</button>
        <button class="btn btn-sm ${isEquipped ? 'btn-danger' : 'btn-heal'}" onclick="toggleEquipSkill('${sId}')">${isEquipped ? 'Снять' : 'В бой'}</button>
      </div>
    `;
    container.appendChild(card);
  }
}

function renderDungeons() {
  const container = document.getElementById('dungeon-list');
  if (!container) return;
  container.innerHTML = '';
  const now = Date.now();

  const diffSelect = document.getElementById('diff-select');
  const curDiff = parseInt(diffSelect ? diffSelect.value : 1) || 1;
  const diffRequiredLvl = DIFF_MIN_LVL[curDiff] || 1;

  const updateModeBtn = (btnId, minLvl, defaultText) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const isUnlocked = player.lvl >= minLvl;
    btn.disabled = !isUnlocked;
    btn.innerHTML = isUnlocked ? defaultText : `🔒 Ур. ${minLvl}+`;
  };

  updateModeBtn('btn-mode-arena', MODE_MIN_LVL.arena, 'РАЗЛОМ');
  updateModeBtn('btn-mode-duel', MODE_MIN_LVL.duel, '1 на 1');
  updateModeBtn('btn-mode-horde', MODE_MIN_LVL.horde, 'ВЫЖИВАНИЕ');
  updateModeBtn('btn-mode-abyss', MODE_MIN_LVL.abyss, `ЭТАЖ <span id="abyss-btn-floor">${player.currentAbyssFloor || 1}</span>`);
  updateModeBtn('btn-mode-bossrush', MODE_MIN_LVL.bossrush, 'БОСС-РАШ');
  updateModeBtn('btn-mode-purgatory', MODE_MIN_LVL.purgatory, 'ЧИСТИЛИЩЕ');
  updateModeBtn('btn-mode-demiurge', MODE_MIN_LVL.demiurge, 'РЕЙД');

  const uniqueDungeons = Array.from(new Map(DUNGEONS.map(d => [d.id, d])).values())
    .sort((a, b) => (a.minLvl || 0) - (b.minLvl || 0));

  uniqueDungeons.forEach(d => {
    const effectiveReqLvl = Math.max(d.minLvl, diffRequiredLvl);
    const isUnlocked = player.lvl >= effectiveReqLvl;
    const cdEnd = dungeonCooldowns[d.id] || 0;
    const isOnCooldown = d.cooldownSec > 0 && now < cdEnd;

    let statusClass = 'ready';
    let statusText = '✓ Доступно';

    if (!isUnlocked) {
      statusClass = 'locked';
      statusText = `🔒 Ур. ${effectiveReqLvl}+`;
    } else if (isOnCooldown) {
      statusClass = 'cd';
      const secLeft = Math.ceil((cdEnd - now) / 1000);
      statusText = `⏳ КД (${secLeft}с)`;
    }

    const row = document.createElement('div');
    row.className = `dungeon-row ${!isUnlocked ? 'dungeon-locked' : ''}`;
    row.innerHTML = `
      <div class="dungeon-info">
        <div class="dungeon-header">
          <span class="dungeon-name">${d.name}</span>
          <span class="dungeon-status ${statusClass}">${statusText}</span>
        </div>
        <div class="dungeon-desc">${d.desc} • <span class="dungeon-req">Требуемый Ур: ${effectiveReqLvl}+</span></div>
      </div>
      <div class="dungeon-actions">
        <button class="btn btn-secondary btn-sm" onclick="openBestiary('${d.id}')">👁 Разведка</button>
        <button class="btn btn-sm" ${isUnlocked && !isOnCooldown ? '' : 'disabled'} onclick="startDungeon('${d.id}')">
          ${!isUnlocked ? `🔒 Ур. ${effectiveReqLvl}+` : (isOnCooldown ? '⏳ КД' : 'В поход ➔')}
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}

function updateQuestProgress(enemyId) {
  if (player.storyIndex < STORY_QUESTS.length) {
    const curStory = STORY_QUESTS[player.storyIndex];
    if (curStory && curStory.targetId === enemyId) {
      player.storyProgress++;
      if (player.storyProgress >= curStory.total) {
        player.storyIndex++;
        player.storyProgress = 0;
        addExp(curStory.xp);
        player.gold += curStory.gold;
        player.talentPoints += curStory.tp;
        const rewardItem = generateLoot(DUNGEONS[Math.min(DUNGEONS.length - 1, player.storyIndex)], 2, curStory.rewardQ, 1.2);
        player.inventory.push(rewardItem);
        addLog(`📜 <b>Сюжет: «${curStory.title}» выполнен!</b>`, 'log-over');
      }
    }
  }

  dailyQuests.forEach(q => {
    if (!q.done && (q.targetEnemyId === enemyId || q.targetEnemyId === 'any')) {
      q.progress++;
      if (q.progress >= q.total) {
        q.done = true;
        addExp(q.xp);
        player.gold += q.gold;
        addLog(`⚔ <b>Контракт «${q.title}» выполнен!</b>`, 'log-hit');
      }
    }
  });
  saveGame();
}

function renderQuests() {
  const mechContainer = document.getElementById('mechanic-quests-list');
  if (mechContainer) {
    mechContainer.innerHTML = '';
    let completedCount = 0;
    MECHANIC_ACHIEVEMENTS.forEach(ach => {
      const prog = Math.min(ach.target, ach.getProg(player));
      const isDone = prog >= ach.target;
      if (isDone) completedCount++;

      const card = document.createElement('div');
      card.className = `quest-card ${isDone ? 'completed' : ''}`;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b style="font-size:11px; color:#fff;">${ach.name}</b>
          <span class="quest-badge ${isDone ? 'done' : 'progress'}">${isDone ? 'ВЫПОЛНЕНО ✓' : `${prog} / ${ach.target}`}</span>
        </div>
        <div style="font-size:9px; color:var(--text-muted);">${ach.desc}</div>
        <div class="progress-wrap"><div class="progress-fill charge-tier-opt" style="width:${(prog/ach.target)*100}%;"></div></div>
      `;
      mechContainer.appendChild(card);
    });

    const questBadgeCnt = document.getElementById('tab-quest-cnt');
    if (questBadgeCnt) questBadgeCnt.innerText = `${completedCount}/${MECHANIC_ACHIEVEMENTS.length}`;
  }

  const storyContainer = document.getElementById('story-quests-list');
  if (storyContainer) {
    storyContainer.innerHTML = '';
    if (player.storyIndex >= STORY_QUESTS.length) {
      storyContainer.innerHTML = '<div style="font-size:10px; color:#34d399; padding:6px;">🎉 Все сюжетные главы полностью завершены!</div>';
    } else {
      const cur = STORY_QUESTS[player.storyIndex];
      const card = document.createElement('div');
      card.className = 'quest-card';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b style="font-size:11px; color:var(--accent);">${cur.title}</b>
          <span class="quest-badge progress">${player.storyProgress} / ${cur.total}</span>
        </div>
        <div style="font-size:9.5px; color:#cbd5e1;">${cur.desc}</div>
        <div style="font-size:8.5px; color:var(--gold);">Награда: +${cur.gold} Зл., +${cur.xp} XP, +${cur.tp} TP, [★x1 Предмет]</div>
      `;
      storyContainer.appendChild(card);
    }
  }

  const dailyContainer = document.getElementById('quests-list');
  if (dailyContainer) {
    dailyContainer.innerHTML = '';
    dailyQuests.forEach(q => {
      const card = document.createElement('div');
      card.className = `quest-card ${q.done ? 'completed' : ''}`;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b style="font-size:10.5px; color:#fff;">${q.title}</b>
          <span class="quest-badge ${q.done ? 'done' : 'progress'}">${q.done ? 'СДАНО ✓' : `${q.progress}/${q.total}`}</span>
        </div>
        <div style="font-size:9px; color:var(--text-muted);">${q.desc}</div>
      `;
      dailyContainer.appendChild(card);
    });
  }
}

function openBestiary(dungeonId) {
  Sound.play('click');
  currentBestiaryDungeonId = dungeonId;
  refreshBestiaryView();
  document.getElementById('bestiary-modal').style.display = 'flex';
}

function closeBestiary(e) {
  if (e.target.id === 'bestiary-modal') {
    Sound.play('click');
    document.getElementById('bestiary-modal').style.display = 'none';
  }
}

function refreshBestiaryView() {
  const d = DUNGEONS.find(x => x.id === currentBestiaryDungeonId);
  if (!d) return;
  setSafeText('modal-dungeon-name', `Разведка: ${d.name}`);
  const body = document.getElementById('modal-dungeon-body');
  const diffVal = parseInt(document.getElementById('modal-diff-select').value) || 1;
  const mult = getDiffMultiplier(diffVal);
  
  let html = `<div style="font-size:9.5px; color:var(--text-muted); margin-bottom:8px;">${d.desc} (Множитель сложности: x${mult.toFixed(1)})</div>`;
  d.stages.forEach((st, sIdx) => {
    html += `<div style="margin-bottom:6px;"><b style="font-size:10px; color:var(--accent);">Этап ${sIdx + 1}: ${st.name}</b><div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:2px;">`;
    st.enemies.forEach(en => {
      html += `<div class="stat-card"><b style="color:#fff;">${en.name}</b><br><span style="font-size:8.5px; color:var(--hp);">❤️ ${(en.hp * mult).toLocaleString()} HP</span> | <span style="font-size:8.5px; color:var(--gold);">⚔ ${(en.atk * mult).toLocaleString()} Атк</span></div>`;
    });
    html += `</div></div>`;
  });
  body.innerHTML = html;
}

function buildCombatArenaDOM() {
  const container = document.getElementById('enemies-arena');
  if (!container) return;
  container.innerHTML = '';
  combat.enemies.forEach((e, idx) => {
    const box = document.createElement('div');
    box.id = `enemy-box-${idx}`;
    box.className = `combat-enemy-box ${idx === combat.targetIndex ? 'selected-target' : ''} ${e.hp <= 0 ? 'dead' : ''}`;
    box.onclick = () => selectCombatTarget(idx);
    let avatarBorder = e.eliteTier ? `border-color:${e.eliteTier.color}; box-shadow:0 0 8px ${e.eliteTier.color};` : (e.isBoss ? 'border-color:#ec4899;' : '');
    box.innerHTML = `
      <div class="target-indicator">ЦЕЛЬ 🎯</div>
      <div class="combatant-avatar" style="${avatarBorder}">${AVATARS[e.avatar] || AVATARS.skeleton}</div>
      <div style="font-size:9.5px; font-weight:bold; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${e.name}</div>
      <div class="progress-wrap"><div id="enemy-hp-bar-${idx}" class="progress-fill fill-hp" style="width:100%;"></div></div>
      <div id="enemy-hp-txt-${idx}" style="font-size:8px; margin-top:2px;">${e.hp.toLocaleString()} / ${e.maxHp.toLocaleString()}</div>
      <div class="progress-wrap" style="height:3px; margin-top:2px;"><div id="enemy-cast-bar-${idx}" class="progress-fill fill-enemy-cast" style="width:0%;"></div></div>
    `;
    container.appendChild(box);
  });
}

function updateCombatTargetsVisual() {
  combat.enemies.forEach((e, idx) => {
    const box = document.getElementById(`enemy-box-${idx}`);
    if (box) {
      box.classList.toggle('selected-target', idx === combat.targetIndex);
      box.classList.toggle('dead', e.hp <= 0);
    }
  });
}

function buildCombatSkillsDOM() {
  const skillsRow = document.getElementById('combat-active-skills-row');
  if (!skillsRow) return;
  skillsRow.innerHTML = '';
  player.equippedSkills.forEach(sId => {
    const sk = SKILLS_DB[sId];
    if (!sk) return;
    const isAwk = !!(player.awakenedSkills && player.awakenedSkills[sId]);
    const btn = document.createElement('button');
    btn.id = `combat-skill-btn-${sId}`;
    btn.className = `btn btn-skill btn-sm ${isAwk ? 'btn-awakened' : ''}`;
    btn.onclick = () => useCombatSkill(sId);
    btn.innerHTML = `<span>${sk.icon} ${isAwk ? '★' : ''}${sk.name}</span> <span id="cd-txt-${sId}" style="font-size:8px;"></span>`;
    skillsRow.appendChild(btn);
  });
}

function updateCombatUI() {
  const maxHp = getPlayerMaxHp(), maxShield = getPlayerMaxShield();
  setSafeText('c-player-hp-txt', `${Math.round(Math.max(0, player.hp)).toLocaleString()} / ${maxHp.toLocaleString()} HP`);
  const playerHpBar = document.getElementById('c-player-hp-bar');
  if (playerHpBar) playerHpBar.style.width = `${Math.max(0, (player.hp / maxHp) * 100)}%`;

  const shieldWrap = document.getElementById('c-player-shield-wrap');
  const shieldTxt = document.getElementById('c-player-shield-txt');
  if (shieldWrap && shieldTxt) {
    if (player.shield > 0) {
      shieldWrap.style.display = 'block'; shieldTxt.style.display = 'block';
      shieldTxt.innerText = `🛡 Щит: ${Math.round(player.shield).toLocaleString()} / ${Math.round(maxShield).toLocaleString()}`;
      const shieldBar = document.getElementById('c-player-shield-bar');
      if (shieldBar) shieldBar.style.width = `${Math.min(100, (player.shield / maxShield) * 100)}%`;
    } else {
      shieldWrap.style.display = 'none'; shieldTxt.style.display = 'none';
    }
  }

  const arenaHdr = document.getElementById('combat-arena-header');
  if (arenaHdr) {
    if (combat.isRaid) {
      arenaHdr.style.display = 'flex'; setSafeText('arena-header-title', '👁 РЕЙД: ДЕМИУРГ');
      setSafeText('arena-timer-txt', `🔥 ЯРОСТЬ: ${Math.max(0, Math.ceil(combat.raidEnrageTimer || 0))}с`);
    } else if (combat.isAbyss) {
      arenaHdr.style.display = 'flex'; setSafeText('arena-header-title', `🌀 Бездна (${combat.abyssFloor} эт.)`);
      setSafeText('arena-timer-txt', `Рекорд: ${player.abyssRecord}`);
    } else if (combat.isHorde) {
      arenaHdr.style.display = 'flex'; setSafeText('arena-header-title', '🛡 ОРДА БЕЗДНЫ');
      setSafeText('arena-timer-txt', `⏱ Выживание: ${Math.floor(combat.hordeTimer)}с`);
    } else if (combat.isBossRush) {
      arenaHdr.style.display = 'flex'; setSafeText('arena-header-title', `👑 БОСС-РАШ (Босс #${combat.bossRushIndex + 1})`);
      setSafeText('arena-timer-txt', `Побед: ${combat.bossRushIndex}`);
    } else if (combat.isArena) {
      arenaHdr.style.display = 'flex'; setSafeText('arena-header-title', '🌌 Арена');
      setSafeText('arena-timer-txt', `⏱ ${Math.max(0, Math.ceil(combat.arenaTimer || 0))}с`);
    } else {
      arenaHdr.style.display = 'none';
    }
  }

  setSafeText('c-potions-txt', player.potions);
  const cData = calculateChargeData();
  const btnAttack = document.getElementById('btn-main-attack');
  const chargeBar = document.getElementById('charge-bar');

  if (chargeBar) {
    chargeBar.style.width = `${Math.min(100, (cData.time / cData.tOpt) * 100)}%`;
    chargeBar.className = `progress-fill charge-tier-${cData.tier}`;
  }
  if (btnAttack) {
    btnAttack.className = `btn btn-charge-attack ${cData.tier === 'opt' ? 'ready-opt' : (cData.tier === 'over' ? 'ready-over' : '')}`;
    btnAttack.disabled = cData.time < cData.tMin;
  }
  setSafeHTML('charge-status-label', cData.label);
  setSafeHTML('charge-mult-label', `x${cData.mult.toFixed(2)}`);

  const targetEnemy = combat.enemies[combat.targetIndex];
  if (targetEnemy && targetEnemy.hp > 0) {
    const effDef = Math.max(0, targetEnemy.def - getPlayerPierce());
    let dmgMult = (combat.deathGameTimer > 0 ? 1.20 : 1.0) * (player.astrolabe.chaoslord ? (1 + combat.mutatedEnemiesKilledCount * 0.3) : 1.0);
    setSafeText('btn-dmg-preview', Math.max(1, Math.round((getPlayerAtk() - effDef) * cData.mult * dmgMult)).toLocaleString());
  } else {
    setSafeText('btn-dmg-preview', '0');
  }

  combat.enemies.forEach((e, idx) => {
    const hpBar = document.getElementById(`enemy-hp-bar-${idx}`);
    const hpTxt = document.getElementById(`enemy-hp-txt-${idx}`);
    const castBar = document.getElementById(`enemy-cast-bar-${idx}`);
    if (hpBar && hpTxt && castBar) {
      hpBar.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
      hpTxt.innerText = `${Math.max(0, Math.round(e.hp)).toLocaleString()} / ${e.maxHp.toLocaleString()}`;
      castBar.style.width = `${Math.min(100, e.castProgress * 100)}%`;
    }
  });

  player.equippedSkills.forEach(sId => {
    const btn = document.getElementById(`combat-skill-btn-${sId}`);
    const cdTxt = document.getElementById(`cd-txt-${sId}`);
    const cd = combat.skillCooldowns[sId] || 0;
    if (btn && cdTxt) {
      btn.disabled = cd > 0 || cData.time < cData.tMin;
      cdTxt.innerText = cd > 0 ? `(${cd.toFixed(1)}s)` : '';
    }
  });
  updateCombatTargetsVisual();
}

function updateUI() {
  const maxHp = getPlayerMaxHp();
  if (player.hp > maxHp) player.hp = maxHp;

  setSafeText('hdr-lvl', player.lvl);
  setSafeText('c-player-lvl', player.lvl);
  setSafeText('hdr-tp', player.talentPoints);
  setSafeText('hdr-gold', player.gold.toLocaleString());
  setSafeText('hdr-void-spheres', player.voidSpheres);
  setSafeText('hdr-dark-matter', player.darkMatter);
  setSafeText('matrix-matter-val', player.darkMatter);
  setSafeText('tree-tp-val', player.talentPoints);
  setSafeText('tab-inv-cnt', player.inventory.length);
  setSafeText('potions-count', player.potions);

  setSafeText('profile-hp-txt', `${Math.round(player.hp).toLocaleString()} / ${maxHp.toLocaleString()} HP`);
  const profileHpBar = document.getElementById('profile-hp-bar');
  if (profileHpBar) profileHpBar.style.width = `${Math.max(0, (player.hp / maxHp) * 100)}%`;

  setSafeText('profile-exp-txt', player.exp.toLocaleString());
  setSafeText('profile-exp-next', player.expNext.toLocaleString());
  const profileExpBar = document.getElementById('profile-exp-bar');
  if (profileExpBar) profileExpBar.style.width = `${Math.min(100, (player.exp / player.expNext) * 100)}%`;

  // Обновление состояния Матрицы Сингулярности (требует Престиж 1+)
  const matrixCard = document.getElementById('matrix-card-block');
  const matrixLockLabel = document.getElementById('matrix-lock-label');
  const matrixButtons = document.querySelectorAll('.matrix-btn');
  const isMatrixUnlocked = (player.transcendLevel || 0) >= 1;

  if (matrixCard && matrixLockLabel) {
    if (!isMatrixUnlocked) {
      matrixLockLabel.innerText = '(🔒 Требуется Престиж Ур. 1)';
      matrixCard.style.opacity = '0.7';
      matrixButtons.forEach(btn => btn.disabled = true);
    } else {
      matrixLockLabel.innerText = '';
      matrixCard.style.opacity = '1.0';
      matrixButtons.forEach(btn => btn.disabled = false);
    }
  }

  const aspd = getPlayerAspd();
  const dr = (getPlayerDR() * 100).toFixed(1);
  setSafeText('stat-atk', getPlayerAtk().toLocaleString());
  setSafeText('stat-def', `${getPlayerDef().toLocaleString()} (${dr}%)`);
  setSafeText('stat-regen', `+${getPlayerRegen()}/с`);
  setSafeText('stat-aspd', `${aspd >= 0 ? '+' : ''}${aspd}%`);
  setSafeText('stat-crit', `${getPlayerCrit()}%`);
  setSafeText('stat-crit-dmg', `+${getPlayerCritDmg()}%`);
  setSafeText('stat-vamp', `${getPlayerVamp()}%`);
  setSafeText('stat-pierce', `${getPlayerPierce().toLocaleString()} ед.`);
  setSafeText('stat-dmg-red', `${getPlayerDmgReduction()}%`);
  setSafeText('stat-sp', `+${getPlayerSkillPower()}%`);
  setSafeText('stat-curse', `${getPlayerCurseChance()}%`);
  setSafeText('stat-gold-bonus', `+${getPlayerGoldBonus()}%`);
  setSafeText('stat-exp-bonus', `+${getPlayerExpBonus()}%`);
  setSafeText('stat-charge-opt', `${getOptimalChargeSec().toFixed(1)}s`);
  setSafeText('transcend-lvl-badge', player.transcendLevel);
  setSafeText('transcend-pct-badge', player.transcendLevel * 25);
  setSafeText('transcend-gain-spheres', player.transcendLevel + 2);
  setSafeText('abyss-btn-floor', player.currentAbyssFloor || 1);
  setSafeText('anomaly-tier-txt', player.anomalyTier);

  const heritageCnt = Math.min(5, player.transcendLevel || 0);
  setSafeText('heritage-seals-cnt', `${heritageCnt}/5`);
  for (let i = 1; i <= 5; i++) {
    const badge = document.getElementById(`heritage-badge-${i}`);
    if (badge) {
      if ((player.transcendLevel || 0) >= i) {
        badge.className = 'quest-badge done';
        badge.innerText = 'ОТКРЫТО ✓';
      } else {
        badge.className = 'quest-badge';
        badge.innerText = 'ЗАКРЫТО';
      }
    }
  }

  const slotSel = document.getElementById('heritage-slot-select');
  if (slotSel) {
    slotSel.value = player.heritageBypassSlot || 'weapon';
    slotSel.disabled = (player.transcendLevel || 0) < 1;
  }

  let astroCount = 0;
  for (let k in player.astrolabe) {
    const nodeEl = document.getElementById(`astro-node-${k}`);
    const btnEl = document.getElementById(`btn-astro-${k}`);
    if (player.astrolabe[k]) {
      astroCount++;
      if (nodeEl) nodeEl.classList.add('unlocked');
      if (btnEl) { btnEl.disabled = true; btnEl.innerText = 'Включено ✓'; }
    }
  }
  setSafeText('astrolabe-cnt-txt', `${astroCount}/4`);

  for (let k in player.talents) setSafeText(`t-lvl-${k}`, `${player.talents[k]}/5`);
  for (let pk in player.voidPerks) setSafeText(`vp-lvl-${pk}`, `${player.voidPerks[pk]}/10`);
  for (let mk in player.matrixPerks) setSafeText(`dm-lvl-${mk}`, `${player.matrixPerks[mk]}/20`);

  renderEquipment(); renderInventory(); renderSkillsManager(); renderDungeons(); renderQuests();

  // === ВЫЗЫВАЕМ БЛОКИРОВКУ В САМОМ КОНЦЕ, ЧТОБЫ ЕЁ НЕ ПЕРЕЗАПИСАЛО ===
  updateStatLocksUI();
}

// СКРЫТИЕ И ЗАМЕНА КАРТОЧЕК ЗАКРЫТЫХ ПРОЦЕНТНЫХ И СПЕЦИАЛЬНЫХ СТАТОВ
function updateStatLocksUI() {
  const transLvl = player.transcendLevel || 0;

  // Все процентные параметры залочены по престижу, кроме крита (stat-crit)
  const statLocks = [
    { id: 'stat-crit-dmg', minTrans: 2 }, // Крит. урон
    { id: 'stat-pierce', minTrans: 3 },    // Пробой
    { id: 'stat-dmg-red', minTrans: 3 },   // Срез урона
    { id: 'stat-sp', minTrans: 2 },        // Сила умений
    { id: 'stat-curse', minTrans: 3 },     // Проклятье
    { id: 'stat-gold-bonus', minTrans: 2 },// Бонус золота
    { id: 'stat-exp-bonus', minTrans: 3 }, // Бонус опыта
    { id: 'stat-aspd', minTrans: 4 },      // Скорость атаки
    { id: 'stat-vamp', minTrans: 5 }       // Вампиризм
  ];

  statLocks.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    const card = el.closest('.stat-card');
    if (!card) return;

    if (transLvl < s.minTrans) {
      card.style.opacity = '0.55';
      card.style.background = 'rgba(15, 23, 42, 0.4)';
      card.style.borderColor = 'rgba(239, 68, 68, 0.2)';
      el.innerHTML = `<span style="font-size:10px; color:#f87171; font-weight:bold;">🔒 Требуется Престиж ${s.minTrans}</span>`;
      const sub = card.querySelector('.sub-desc');
      if (sub) sub.innerText = `Параметр заблокирован Возвышением.`;
    } else {
      card.style.opacity = '1.0';
      card.style.background = '';
      card.style.borderColor = '';
    }
  });
}

// Блокировка Калибратора Аномалий (19+ Ур.)
const isAnomalyUnlocked = player.lvl >= 19;
const anomalyBadge = document.getElementById('anomaly-lock-badge');
const anomalyCard = document.getElementById('anomaly-calibrator-card');

if (anomalyBadge) {
  if (isAnomalyUnlocked) {
    anomalyBadge.innerHTML = `Уровень: <span id="anomaly-tier-txt">${player.anomalyTier}</span>`;
  } else {
    anomalyBadge.innerHTML = `<span class="dungeon-status locked">🔒 Открывается на 19 ур.</span>`;
  }
}

if (anomalyCard) {
  anomalyCard.classList.toggle('dungeon-locked', !isAnomalyUnlocked);
  const btns = anomalyCard.querySelectorAll('button');
  btns.forEach(btn => {
    btn.disabled = !isAnomalyUnlocked;
  });
}