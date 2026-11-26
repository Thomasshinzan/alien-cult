import { state } from './state.js';

export let humanData = null;
export let stageData = [];
export let eventData = [];
export let hideoutData = [];

// ステージ成長倍率（案C）: 信者がステージごとに×10で増え、MP回復が約×3.16で伸びるのに合わせた指数倍率。
// 意思力（出現時）と労働収入が共有する。S1〜S3は×1で序盤の感触は従来通り。ボスには適用しない。
export const STAGE_GROWTH_MULTIPLIERS = [1, 1, 1, 3, 10, 31, 99, 313, 988, 2795];
export function getStageGrowthMultiplier() {
    return STAGE_GROWTH_MULTIPLIERS[Math.min(state.currentStageIndex, STAGE_GROWTH_MULTIPLIERS.length - 1)];
}

// 資金の基準値を現在ステージの金額に換算する（スキル効果・イベント効果・コレクション価格用）
export function scaleFunds(base) {
    return Math.round(base * getStageGrowthMultiplier());
}

export async function loadData() {
    const [humanRes, stageRes, eventRes, hideoutRes] = await Promise.all([
        fetch('human.json', { cache: 'no-cache' }),
        fetch('stage.json', { cache: 'no-cache' }),
        fetch('event.json', { cache: 'no-cache' }),
        fetch('hideout.json', { cache: 'no-cache' })
    ]);
    
    if (!humanRes.ok) throw new Error("human.json が見つかりません。");
    if (!stageRes.ok) throw new Error("stage.json が見つかりません。");
    if (!eventRes.ok) throw new Error("event.json が見つかりません。");
    if (!hideoutRes.ok) throw new Error("hideout.json が見つかりません。");

    humanData = await humanRes.json();
    stageData = await stageRes.json();
    eventData = await eventRes.json();
    hideoutData = await hideoutRes.json();
}

export function getCurrentStage() {
    const index = Math.min(state.currentStageIndex, stageData.length - 1);
    return stageData[index];
}

export function generateHuman() {
    if (!humanData || !humanData.general || !humanData.elite) return null;

    // レベル制プール: 職業のレベル <= 現在のステージ番号 のものだけが候補。
    // 抽選の重みはレベル値そのもの（高レベルほど出やすい）。
    // 一般人は低レベル中心・政財界人は高レベル中心の分布なので、
    // ステージが進むほど自然に政財界人の比率が上がる。
    const stageLevel = state.currentStageIndex + 1;
    const wpMult = getStageGrowthMultiplier();
    const candidates = [];
    const addCandidates = (professions, type) => {
        (professions || []).forEach(prof => {
            const lv = prof.level || 1;
            if (lv <= stageLevel) candidates.push({ prof, type, weight: lv });
        });
    };
    addCandidates(humanData.general.professions, 'labor');
    addCandidates(humanData.general.recruitProfessions, 'recruit');
    addCandidates(humanData.elite.professions, 'elite');
    if (candidates.length === 0) return null;

    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let roll = Math.random() * totalWeight;
    let picked = candidates[candidates.length - 1];
    for (const c of candidates) {
        roll -= c.weight;
        if (roll < 0) { picked = c; break; }
    }
    const { prof, type } = picked;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    if (type === 'elite') {
        const mod = pick(humanData.elite.modifiers);
        let calcHp = 100 + prof.hpMod + mod.hpMod;
        return {
            id: Date.now() + Math.random(),
            type: 'elite',
            name: mod.name + prof.name,
            labor: Math.max(1, Math.min(20, prof.baseLabor + mod.laborMod)),
            recruit: 0,
            influence: Math.max(1, prof.baseInfluence + mod.influenceMod),
            willpower: Math.round(Math.max(10, prof.baseWillpower + mod.willpowerMod) * wpMult),
            brainwash: 0,
            hp: calcHp,
            maxHp: calcHp,
            action: 'labor',
            isBoss: false
        };
    }

    if (type === 'recruit') {
        const mod = pick(humanData.general.recruitModifiers);
        let calcHp = 100 + prof.hpMod + mod.hpMod;
        return {
            id: Date.now() + Math.random(),
            type: 'recruit',
            name: mod.name + prof.name,
            recruit: Math.max(1, Math.min(10, prof.baseRecruit + mod.recruitMod)),
            labor: 0,
            willpower: Math.round(Math.max(2, prof.baseWillpower + mod.willpowerMod) * wpMult),
            brainwash: 0,
            hp: calcHp,
            maxHp: calcHp,
            action: 'recruit',
            isBoss: false
        };
    }

    const mod = pick(humanData.general.modifiers);
    let calcHp = 100 + prof.hpMod + mod.hpMod;
    return {
        id: Date.now() + Math.random(),
        type: 'labor',
        name: mod.name + prof.name,
        labor: Math.max(1, Math.min(10, prof.baseLabor + mod.laborMod)),
        recruit: 0,
        willpower: Math.round(Math.max(2, prof.baseWillpower + mod.willpowerMod) * wpMult),
        brainwash: 0,
        hp: calcHp,
        maxHp: calcHp,
        action: 'labor',
        isBoss: false
    };
}

// 旧セーブ救済: 最終ボス洗脳後に currentStageIndex が範囲外（=stageData.length）まで
// 進んでしまったセーブを、最終ステージのクリア済み状態に正す
export function migrateClearedSave() {
    if (stageData.length === 0) return false;
    if (state.currentStageIndex < stageData.length) return false;
    state.currentStageIndex = stageData.length - 1;
    state.gameCleared = true;
    state.bossSpawned = true;
    state.humans = state.humans.filter(h => !h.isBoss); // 再出現した最終ボスの複製を取り除く
    if (state.selectedHumanId !== null && !state.humans.some(h => h.id === state.selectedHumanId)) {
        state.selectedHumanId = null;
    }
    return true;
}

export function trySpawnBoss() {
    if (state.gameCleared) return null;
    if (state.bossSpawned) return null;

    const stage = getCurrentStage();
    if (state.cultStats.followers >= stage.bossCondition && stage.bossId) {
        const bossData = (humanData.bosses || []).find(u => u.id === stage.bossId);
        if (bossData) {
            state.bossSpawned = true;
            return {
                id: Date.now() + Math.random(),
                type: 'labor',
                name: bossData.name,
                labor: bossData.labor,
                recruit: 0,
                willpower: bossData.willpower,
                brainwash: 0,
                hp: bossData.hp,
                maxHp: bossData.hp,
                action: 'rest',
                isBoss: true,
                uniqueData: bossData
            };
        }
    }
    return null;
}
