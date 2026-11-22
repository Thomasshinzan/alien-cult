import { state } from './state.js';

export let humanData = null;
export let stageData = [];
export let eventData = [];
export let hideoutData = [];

export async function loadData() {
    const [humanRes, stageRes, eventRes, hideoutRes] = await Promise.all([
        fetch('human.json'),
        fetch('stage.json'),
        fetch('event.json'),
        fetch('hideout.json')
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
    if (!humanData) return null;

    // ステージ4以降かつ政財界データがある場合、40%の確率で政財界タイプを生成
    if (
        state.currentStageIndex >= 3 &&
        humanData.eliteModifiers && humanData.eliteModifiers.length > 0 &&
        humanData.eliteProfessions && humanData.eliteProfessions.length > 0 &&
        Math.random() < 0.4
    ) {
        const mod = humanData.eliteModifiers[Math.floor(Math.random() * humanData.eliteModifiers.length)];
        const prof = humanData.eliteProfessions[Math.floor(Math.random() * humanData.eliteProfessions.length)];

        let calcLabor = Math.max(1, Math.min(20, prof.baseLabor + mod.laborMod));
        let calcInfluence = Math.max(1, prof.baseInfluence + mod.influenceMod);
        let calcHp = 100 + prof.hpMod + mod.hpMod;
        let calcWillpower = Math.max(10, prof.baseWillpower + mod.willpowerMod);

        return {
            id: Date.now() + Math.random(),
            type: 'elite',
            name: mod.name + prof.name,
            labor: calcLabor,
            recruit: 0,
            influence: calcInfluence,
            willpower: calcWillpower,
            brainwash: 0,
            hp: calcHp,
            maxHp: calcHp,
            action: 'labor',
            isBoss: false
        };
    }

    // ステージ2以降かつ勧誘データがある場合、40%の確率で勧誘タイプを生成
    if (
        state.currentStageIndex >= 1 &&
        humanData.recruitModifiers && humanData.recruitModifiers.length > 0 &&
        humanData.recruitProfessions && humanData.recruitProfessions.length > 0 &&
        Math.random() < 0.4
    ) {
        const mod = humanData.recruitModifiers[Math.floor(Math.random() * humanData.recruitModifiers.length)];
        const prof = humanData.recruitProfessions[Math.floor(Math.random() * humanData.recruitProfessions.length)];

        let calcRecruit = Math.max(1, Math.min(10, prof.baseRecruit + mod.recruitMod));
        let calcHp = 100 + prof.hpMod + mod.hpMod;
        let calcWillpower = Math.max(2, prof.baseWillpower + mod.willpowerMod);

        return {
            id: Date.now() + Math.random(),
            type: 'recruit',
            name: mod.name + prof.name,
            recruit: calcRecruit,
            labor: 0,
            willpower: calcWillpower,
            brainwash: 0,
            hp: calcHp,
            maxHp: calcHp,
            action: 'recruit',
            isBoss: false
        };
    }

    const mod = humanData.modifiers[Math.floor(Math.random() * humanData.modifiers.length)];
    const prof = humanData.professions[Math.floor(Math.random() * humanData.professions.length)];
    
    let calcLabor = Math.max(1, Math.min(10, prof.baseLabor + mod.laborMod));
    let calcHp = 100 + prof.hpMod + mod.hpMod;
    let calcWillpower = Math.max(2, prof.baseWillpower + mod.willpowerMod);

    return {
        id: Date.now() + Math.random(),
        type: 'labor',
        name: mod.name + prof.name,
        labor: calcLabor,
        recruit: 0,
        willpower: calcWillpower,
        brainwash: 0,
        hp: calcHp, 
        maxHp: calcHp,
        action: 'labor',
        isBoss: false
    };
}

export function trySpawnBoss() {
    if (state.bossSpawned) return null;

    const stage = getCurrentStage();
    if (state.cultStats.followers >= stage.bossCondition && stage.bossId) {
        const bossData = humanData.uniques.find(u => u.id === stage.bossId);
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
