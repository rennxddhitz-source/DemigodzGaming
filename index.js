/**
 * MOBA Arena Prototyp - 5v5 Isometric Mobile Game
 * Core Implementation based on Master Prompt Specification
 */

// Game Configuration
const CONFIG = {
    // Game Settings
    MATCH_DURATION: 900, // 15 minutes in seconds
    STARTING_GOLD: 500,
    STARTING_XP: 0,
    
    // Economy
    GOLD_PASSIVE_RATE: 15, // gold per 3 seconds
    XP_PER_MINION: 80, // average XP per minion kill
    XP_PER_HERO: 250, // average XP per hero kill
    HP_PER_LEVEL: 150,
    ATK_PER_LEVEL: 8,
    DEF_PER_LEVEL: 3,
    
    // Combat Formulas
    DEF_REDUCTION: (def) => def / (def + 100),
    FINAL_DMG: (baseAtk, reduction) => baseAtk * (1 - reduction),
    
    // Respawn
    RESPAWN_BASE: 5, // base respawn time in seconds
    RESPAWN_LEVEL_MULT: 2, // additional time per level
    
    // Skill Cooldowns (seconds)
    SKILL_COOLDOWNS: {
        BASIC_1: 6,
        BASIC_2: 6,
        ULTIMATE: 40
    },
    
    // Mana Regeneration
    MANA_REGEN_PER_SEC: 1.5, // 1.5% per second
    
    // Visual
    ZOOM_LEVEL: 1,
    CAMERA_ANGLE: { x: 0, y: 0, z: 45 }, // isometric angle
    
    // UI Dimensions
    JOYSTICK_SIZE: 120,
    SKILL_BUTTON_SIZE: 60,
    MINIMAP_SIZE: 150,
    
    // Audio
    BPM_LOBBY: 100,
    BPM_TEAMFIGHT: 140
};

// Color Palette
const PALETTE = {
    ALLY: { r: 0, g: 168, b: 232 },       // #00A8E8
    ENEMY: { r: 230, g: 57, b: 70 },       // #E63946
    JUNGLE: { r: 45, g: 106, b: 79 },      // #2D6A4F
    BACKGROUND: { r: 30, g: 30, b: 50 }     // Dark background
};

// Base Statistics per Level
const BASE_STATS = {
    hp: (level) => 500 + (level - 1) * CONFIG.HP_PER_LEVEL,
    atk: (level) => 50 + (level - 1) * CONFIG.ATK_PER_LEVEL,
    def: (level) => 30 + (level - 1) * CONFIG.DEF_PER_LEVEL,
    maxMana: (level) => 150 + (level - 1) * 25,
    manaRegen: (level) => CONFIG.MANA_REGEN_PER_SEC * level
};

// Skill Definitions
const SKILLS = {
    BASIC_1: {
        name: "Skill 1",
        cooldown: CONFIG.SKILL_COOLDOWNS.BASIC_1,
        damageMultiplier: 1.5,
        castTime: 0.5,
        description: "Primary basic skill"
    },
    BASIC_2: {
        name: "Skill 2",
        cooldown: CONFIG.SKILL_COOLDOWNS.BASIC_2,
        damageMultiplier: 1.5,
        castTime: 0.5,
        description: "Secondary basic skill"
    },
    ULTIMATE: {
        name: "Ultimate",
        cooldown: CONFIG.SKILL_COOLDOWNS.ULTIMATE,
        damageMultiplier: 3.0,
        castTime: 1.0,
        description: "Ultimate ability game-changer"
    }
};

// Normalize skill name mapping
const SKILL_NAME_MAP = {
    basic1: 'BASIC_1',
    basic2: 'BASIC_2',
    ultimate: 'ULTIMATE'
};

// Minion Wave Configuration
const MINION_WAVE = {
    spawnInterval: 30, // seconds
    minionSpeed: 150, // pixels per second
    goldPerLastHit: 30,
    xpPerLastHit: 80,
    towerDamage: 20
};

// Tower Configuration
const TOWER = {
    tier1: { hp: 800, def: 50, dmg: 40, reward: 150 },
    tier2: { hp: 1200, def: 75, dmg: 60, reward: 200 },
    tier3: { hp: 1800, def: 100, dmg: 80, reward: 300 },
    base: { hp: 2000, def: 150, dmg: 100, reward: 500 }
};

// Game States
const GAME_STATE = {
    LOBBY: 'lobby',
    SPAWNING: 'spawning',
    LANING: 'laning',
    OBJECTIVE: 'objective',
    PUSHING: 'pushing',
    TEAM_FIGHT: 'team_fight',
    GAME_OVER: 'game_over'
};

// Player Class
class Player {
    constructor(id, x, y, isAlly) {
        this.id = id;
        this.isAlly = isAlly;
        this.teamColor = isAlly ? PALETTE.ALLY : PALETTE.ENEMY;
        
        // Position
        this.x = x;
        this.y = y;
        
        // Stats
        this.level = 1;
        this.xp = CONFIG.STARTING_XP;
        this.nextLevelXp = 100;
        this.gold = CONFIG.STARTING_GOLD;
        this.goldPassiveTimer = 0;
        
        // Primary Stats
        this.hp = BASE_STATS.hp(1);
        this.maxHp = this.hp;
        this.atk = BASE_STATS.atk(1);
        this.def = BASE_STATS.def(1);
        this.maxMana = BASE_STATS.maxMana(1);
        this.mana = this.maxMana;
        this.manaRegen = BASE_STATS.manaRegen(1);
        
        // State
        this.alive = true;
        this.deathTime = 0;
        this.kills = 0;
        this.deaths = 0;
        this.assists = 0;
        
        // Skills
        this.skills = {
            BASIC_1: { cooldown: 0, ready: true },
            BASIC_2: { cooldown: 0, ready: true },
            ULTIMATE: { cooldown: 0, ready: true }
        };
        
        // Equipment
        this.items = [];
    }
    
    gainXp(amount) {
        this.xp += amount;
        if (this.xp >= this.nextLevelXp) {
            this.levelUp();
        }
    }
    
    levelUp() {
        this.level++;
        this.xp -= this.nextLevelXp;
        this.nextLevelXp = 100 * this.level; // scaling XP requirement
        
        // Stat increases
        this.hp += CONFIG.HP_PER_LEVEL;
        this.maxHp += CONFIG.HP_PER_LEVEL;
        this.atk += CONFIG.ATK_PER_LEVEL;
        this.def += CONFIG.DEF_PER_LEVEL;
        this.maxMana += BASE_STATS.maxMana(this.level) - BASE_STATS.maxMana(this.level - 1);
        this.mana = this.maxMana; // Full mana on level up
        
        // Update display
        console.log(`Player ${this.id} reached level ${this.level}!`);
    }
    
    gainGold(amount) {
        this.gold += amount;
        // Check for passive gold accumulation
        return this.gold;
    }
    
    loseGold(amount) {
        if (this.gold >= amount) {
            this.gold -= amount;
        }
        return this.gold;
    }
    
    // Basic Attack
    basicAttack(target) {
        const reduction = CONFIG.DEF_REDUCTION(this.def);
        const damage = CONFIG.FINAL_DMG(this.atk, reduction);
        target.takeDamage(damage);
        return damage;
    }
    
    // Take Damage
    takeDamage(amount) {
        // Apply defense reduction
        const reduction = CONFIG.DEF_REDUCTION(this.def);
        const effectiveDamage = CONFIG.FINAL_DMG(amount, reduction);
        this.hp -= effectiveDamage;
        
        // Check death
        if (this.hp <= 0) {
            this.die();
        }
        
        return effectiveDamage;
    }
    
    die() {
        this.alive = false;
        this.deathTime = Date.now() / 1000;
        this.hp = 0;
        
        // Calculate respawn time
        const respawnTime = CONFIG.RESPAWN_BASE + (this.level * CONFIG.RESPAWN_LEVEL_MULT);
        this.respawnTime = respawnTime;
        
        console.log(`Player ${this.id} died. Respawn in ${respawnTime}s`);
    }
    
    respawn() {
        this.alive = true;
        this.hp = this.maxHp;
        this.mana = this.maxMana;
        this.x = CONFIG.START_POSITIONS[this.id].x;
        this.y = CONFIG.START_POSITIONS[this.id].y;
        this.level = 1;
        this.xp = CONFIG.STARTING_XP;
        this.gold = CONFIG.STARTING_GOLD;
        this.kills = 0;
        this.deaths++;
        this.skills = {
            basic1: { cooldown: 0, ready: true },
            basic2: { cooldown: 0, ready: true },
            ultimate: { cooldown: 0, ready: true }
        };
        console.log(`Player ${this.id} respawned at level 1`);
    }
    
    // Skill Usage
    useSkill(skillName, target) {
        // Normalize skill name
        const normalizedName = SKILL_NAME_MAP[skillName] || skillName;
        const skill = SKILLS[normalizedName];
        if (!this.skills[normalizedName].ready) return false;
        
        // Check mana cost (simple: % of max mana)
        const manaCost = this.maxMana * 0.1; // 10% of max mana
        if (this.mana < manaCost) {
            console.log(`Not enough mana for ${skillName}`);
            return false;
        }
        
        // Consume mana
        this.mana -= manaCost;
        
        // Set cooldown
        this.skills[normalizedName].cooldown = skill.cooldown;
        this.skills[normalizedName].ready = false;
        
        // Execute skill
        console.log(`Player ${this.id} used ${skillName}`);
        
        if (skillName === 'ULTIMATE') {
            // Ultimate has area of effect
            this.ultimateEffect(target);
        }
        
        return true;
    }
    
    ultimateEffect(target) {
        // Apply ultimate damage
        const reduction = CONFIG.DEF_REDUCTION(this.def);
        const damage = CONFIG.FINAL_DMG(this.atk * SKILLS.ULTIMATE.damageMultiplier, reduction);
        if (target) {
            target.takeDamage(damage * 2); // Ultimate does double damage
        }
    }
    
    // Update mana regeneration
    updateMana(deltaTime) {
        if (this.mana < this.maxMana) {
            const regen = this.manaRegen * (deltaTime / 1000);
            this.mana = Math.min(this.maxMana, this.mana + regen);
        }
    }
    
    // Update cooldowns
    updateCooldowns(deltaTime) {
        if (!this.skills.BASIC_1.ready) {
            this.skills.BASIC_1.cooldown -= deltaTime / 1000;
            if (this.skills.BASIC_1.cooldown <= 0) {
                this.skills.BASIC_1.ready = true;
            }
        }
        if (!this.skills.BASIC_2.ready) {
            this.skills.BASIC_2.cooldown -= deltaTime / 1000;
            if (this.skills.BASIC_2.cooldown <= 0) {
                this.skills.BASIC_2.ready = true;
            }
        }
        if (!this.skills.ULTIMATE.ready) {
            this.skills.ULTIMATE.cooldown -= deltaTime / 1000;
            if (this.skills.ULTIMATE.cooldown <= 0) {
                this.skills.ULTIMATE.ready = true;
            }
        }
    }
    
    // Update gold passive
    updateGoldPassive(deltaTime) {
        // Gain gold every 3 seconds
        this.goldPassiveTimer += deltaTime / 1000;
        if (this.goldPassiveTimer >= 3) {
            this.gold += CONFIG.GOLD_PASSIVE_RATE;
            this.goldPassiveTimer = 0;
        }
    }
}

// Minion Class
class Minion {
    constructor(x, y, isAlly, tier = 1) {
        this.x = x;
        this.y = y;
        this.isAlly = isAlly;
        this.tier = tier;
        this.teamColor = isAlly ? PALETTE.ALLY : PALETTE.ENEMY;
        
        // Stats based on tier and position
        this.hp = TOWER[`tier${tier}`].hp * 0.3;
        this.maxHp = this.hp;
        this.atk = TOWER[`tier${tier}`].dmg * 0.5;
        this.def = 20;
        this.alive = true;
        
        // Movement
        this.target = null; // Target tower or enemy
        this.speed = MINION_WAVE.minionSpeed;
        
        // Rewards
        this.goldReward = MINION_WAVE.goldPerLastHit;
        this.xpReward = MINION_WAVE.xpPerLastHit;
    }
    
    update(deltaTime, game) {
        if (!this.alive) return;
        
        // AI: Find target
        if (!this.target) {
            this.findTarget(game);
        }
        
        // Move toward target
        if (this.target && this.target.alive) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > this.speed * (deltaTime / 1000)) {
                this.x += (dx / dist) * this.speed * (deltaTime / 1000);
                this.y += (dy / dist) * this.speed * (deltaTime / 1000);
            } else {
                // Reach target
                this.attackTarget(this.target);
            }
        }
        
        // Check if should return to base
        this.aiBehavior(game);
    }
    
    findTarget(game) {
        // Find nearest enemy player or tower
        const entities = [...game.players, ...game.towers];
        let closest = null;
        let minDist = Infinity;
        
        for (const entity of entities) {
            if (entity.isAlly !== this.isAlly && entity.alive) {
                const dx = entity.x - this.x;
                const dy = entity.y - this.y;
                const dist = dx * dx + dy * dy;
                if (dist < minDist) {
                    minDist = dist;
                    closest = entity;
                }
            }
        }
        
        this.target = closest;
    }
    
    attackTarget(target) {
        // Basic attack on target
        const reduction = CONFIG.DEF_REDUCTION(this.def);
        const damage = CONFIG.FINAL_DMG(this.atk, reduction);
        target.takeDamage(damage);
        
        // If tower, deal tower damage
        if (target.type === 'tower') {
            // Minion wave clears slowly
        }
    }
    
    aiBehavior(game) {
        // Simple AI: if no target, wander toward lane
        // If near tower, attack
    }
}

// Tower Class
class Tower {
    constructor(x, y, tier, isAlly) {
        this.x = x;
        this.y = y;
        this.tier = tier;
        this.isAlly = isAlly;
        this.teamColor = isAlly ? PALETTE.ALLY : PALETTE.ENEMY;
        
        const towerStats = TOWER[`tier${tier}`] || TOWER.base;
        this.hp = towerStats.hp;
        this.maxHp = towerStats.hp;
        this.def = towerStats.def;
        this.dmg = towerStats.dmg;
        this.alive = true;
        this.type = 'tower';
        
        // Position based on tier
        this.position = `tier${tier}`;
    }
    
    takeDamage(amount, source) {
        const reduction = CONFIG.DEF_REDUCTION(this.def);
        const effectiveDamage = CONFIG.FINAL_DMG(amount, reduction);
        this.hp -= effectiveDamage;
        
        if (this.hp <= 0) {
            this.destroy();
        }
        
        return effectiveDamage;
    }
    
    destroy() {
        this.alive = false;
        console.log(`Tier ${this.tier} Tower destroyed!`);
        
        // Drop gold or buff
        // Trigger objective control
    }
    
    attackNearbyMinions(players) {
        // Tower attacks nearest minion
        const nearest = players.find(p => 
            Math.abs(p.x - this.x) < 200 && Math.abs(p.y - this.y) < 200 && p.alive
        );
        if (nearest) {
            nearest.takeDamage(this.dmg);
        }
    }
}

// Game Manager
class GameManager {
    constructor() {
        this.state = GAME_STATE.LOBBY;
        this.players = [];
        this.minions = [];
        this.towers = [];
        this.objectives = [];
        this.timer = CONFIG.MATCH_DURATION;
        this.startTime = Date.now() / 1000;
        
        // Lane positions
        this.lanePositions = {
            left: { x: 200, y: 300 },
            middle: { x: 400, y: 300 },
            right: { x: 600, y: 300 }
        };
        
        // Start positions for players
        this.startPositions = {
            allyFountain: { x: 100, y: 100 },
            enemyFountain: { x: 700, y: 500 }
        };
        CONFIG.START_POSITIONS = this.startPositions;
        
        // Initialize game objects
        this.initialize();
    }
    
    initialize() {
        // Create towers (3 tiers per team)
        for (let i = 1; i <= 3; i++) {
            // Ally towers
            this.towers.push(new Tower(100 + (i * 100), 100, i, true));
            // Enemy towers
            this.towers.push(new Tower(700 - (i * 100), 500, i, false));
        }
        
        // Create initial minions
        this.spawnMinionWave();
        
        // Create objectives (Turtle/Lord)
        this.createObjectives();
    }
    
    spawnMinionWave() {
        // Spawn minions for each lane
        for (const [laneName, pos] of Object.entries(this.lanePositions)) {
            for (let i = 0; i < 3; i++) {
                const minion = new Minion(pos.x, pos.y + (i * 50), true);
                this.minions.push(minion);
            }
            // Enemy minions
            for (let i = 0; i < 3; i++) {
                const minion = new Minion(pos.x + 400, pos.y + (i * 50), false);
                this.minions.push(minion);
            }
        }
    }
    
    createObjectives() {
        // River objective (Turtle/Lord)
        this.objectives.push({
            type: 'turtle',
            x: 400,
            y: 400,
            respawnTime: 300, // 5 minutes
            active: true,
            buff: 'damage_boost'
        });
    }
    
    update(deltaTime) {
        switch (this.state) {
            case GAME_STATE.LOBBY:
                this.updateLobby(deltaTime);
                break;
            case GAME_STATE.LANING:
                this.updateLaning(deltaTime);
                break;
            case GAME_STATE.OBJECTIVE:
                this.updateObjective(deltaTime);
                break;
            case GAME_STATE.PUSHING:
                this.updatePushing(deltaTime);
                break;
            case GAME_STATE.TEAM_FIGHT:
                this.updateTeamFight(deltaTime);
                break;
        }
        
        // Update timer
        this.timer -= deltaTime / 1000;
        if (this.timer <= 0) {
            this.endGame();
        }
        
        // Update all players
        for (const player of this.players) {
            player.updateCooldowns(deltaTime);
            player.updateMana(deltaTime);
            player.updateGoldPassive(deltaTime);
        }
        
        // Update minions
        for (const minion of this.minions) {
            minion.update(deltaTime, this);
        }
        
        // Update towers
        for (const tower of this.towers) {
            if (tower.alive) {
                tower.attackNearbyMinions(this.players.filter(p => p.alive));
            }
        }
    }
    
    updateLobby(deltaTime) {
        // Transition to spawning after short delay
        if (this.players.length >= 10) { // 5v5
            this.state = GAME_STATE.SPAWNING;
            this.startTime = Date.now() / 1000;
        }
    }
    
    updateLaning(deltaTime) {
        // Natural game progression
        // Check for objective control opportunities
        this.checkObjectives();
        
        // Check tower status
        this.checkTowerProgress();
    }
    
    updateObjective(deltaTime) {
        // River objective active
        this.checkTurtleLord();
    }
    
    updatePushing(deltaTime) {
        // Lanes advancing
        this.checkLaneAdvancement();
    }
    
    updateTeamFight(deltaTime) {
        // Late game team fights
        this.checkTeamFightConditions();
    }
    
    checkObjectives() {
        // Check if turtle/lord is available
        const turtle = this.objectives.find(o => o.type === 'turtle');
        if (turtle && turtle.active && this.timer < CONFIG.MATCH_DURATION - 300) {
            // Objective available - players should go for it
            // Update UI to highlight objective
        }
    }
    
    checkTurtleLord() {
        // Turtle/Lord objective logic
        const turtle = this.objectives.find(o => o.type === 'turtle');
        if (turtle && turtle.active) {
            // Check if players are near it
            for (const player of this.players) {
                const dx = player.x - turtle.x;
                const dy = player.y - turtle.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 200) {
                    // Player is near objective - could interact
                    if (Math.random() > 0.99) {
                        // Turtle killed - give buff
                        turtle.active = false;
                        turtle.respawnTime = 180; // Respawn in 3 minutes
                        setTimeout(() => {
                            turtle.active = true;
                        }, turtle.respawnTime * 1000);
                    }
                }
            }
        }
    }
    
    checkTowerProgress() {
        // Check if towers are being pushed
        // If all tier 1 towers down, advance to tier 2
        const allyTier1 = this.towers.filter(t => t.isAlly && t.tier === 1 && t.alive);
        const enemyTier1 = this.towers.filter(t => !t.isAlly && t.tier === 1 && t.alive);
        
        if (allyTier1.length === 0 && this.state !== GAME_STATE.PUSHING) {
            // All ally tier 1 down - enemy pushing
            this.state = GAME_STATE.PUSHING;
        }
        if (enemyTier1.length === 0 && this.state !== GAME_STATE.PUSHING) {
            // All enemy tier 1 down - ally pushing
            this.state = GAME_STATE.PUSHING;
        }
    }
    
    checkLaneAdvancement() {
        // Check if minions have advanced past tower range
        for (const tower of this.towers) {
            if (tower.alive) {
                const nearMinions = this.minions.filter(m => 
                    Math.abs(m.x - tower.x) < 300 && Math.abs(m.y - tower.y) < 300 && m.alive
                );
                if (nearMinions.length > 0) {
                    // Minions at tower - tower should be attacking
                }
            }
        }
    }
    
    checkTeamFightConditions() {
        // Check if players are grouped near center
        // If 3+ players from each team in center area -> team fight
        const centerPlayers = this.players.filter(p => 
            Math.abs(p.x - 400) < 300 && Math.abs(p.y - 400) < 300 && p.alive
        );
        
        const allyInCenter = centerPlayers.filter(p => p.isAlly).length;
        const enemyInCenter = centerPlayers.filter(p => !p.isAlly).length;
        
        if (allyInCenter >= 3 && enemyInCenter >= 3) {
            this.state = GAME_STATE.TEAM_FIGHT;
            // Could trigger special team fight music/BGM change
        }
    }
    
    endGame() {
        this.state = GAME_STATE.GAME_OVER;
        this.determineWinner();
    }
    
    determineWinner() {
        const aliveAllyTowers = this.towers.filter(t => t.isAlly && t.alive).length;
        const aliveEnemyTowers = this.towers.filter(t => !t.isAlly && t.alive).length;
        
        let winner;
        if (aliveAllyTowers <= 0) {
            winner = 'enemy';
        } else if (aliveEnemyTowers <= 0) {
            winner = 'ally';
        } else {
            // Compare remaining tower health/levels
            winner = aliveAllyTowers > aliveEnemyTowers ? 'ally' : 'enemy';
        }
        
        console.log(`Game Over! Winner: ${winner}`);
        this.state = GAME_STATE.GAME_OVER;
    }
    
    // Player actions
    playerKill(player, killedPlayer) {
        // Grant XP and gold
        const xpGain = Math.random() * 100 + 200; // 200-300 XP
        player.gainXp(xpGain);
        
        const goldGain = Math.random() * 100 + 100; // 100-200 gold
        player.gainGold(goldGain);
        
        killedPlayer.deaths++;
        player.kills++;
        
        // Assist tracking - damage contributors get assists
        // ...
        
        // Respawn killed player
        setTimeout(() => {
            killedPlayer.respawn();
        }, killedPlayer.respawnTime * 1000);
        
        console.log(`Player ${player.id} killed ${killedPlayer.id}`);
    }
    
    playerLastHit(player, minion) {
        // Grant last hit rewards
        player.gainGold(minion.goldReward);
        player.gainXp(minion.xpReward);
        
        // Remove minion
        const index = this.minions.indexOf(minion);
        if (index > -1) {
            this.minions.splice(index, 1);
        }
        
        // Spawn replacement minion eventually
        // ...
        
        console.log(`Player ${player.id} last-hit minion`);
    }
}

// Export for Phaser integration
export { CONFIG, PALETTE, GAME_STATE, Player, Minion, Tower, GameManager };

// Initialize Game - will be called from Phaser
function initGame() {
    const gameManager = new GameManager();
    
    // Add sample players for 5v5 demonstration
    // Ally team (Dire/ Radiant faction A)
    for (let i = 0; i < 5; i++) {
        const player = new Player(i, 100, 100, true);
        // Randomize starting position slightly within fountain area
        player.x = 100 + (Math.random() * 50);
        player.y = 100 + (Math.random() * 50);
        gameManager.players.push(player);
    }
    
    // Enemy team (faction B)
    for (let i = 0; i < 5; i++) {
        const player = new Player(i + 100, 700, 500, false);
        player.x = 700 + (Math.random() * 50);
        player.y = 500 + (Math.random() * 50);
        gameManager.players.push(player);
    }
    
    return gameManager;
}

// Game Loop - Phaser compatible
function gameLoop(gameManager, deltaTime) {
    // Update game manager
    gameManager.update(deltaTime);
    
    // Check for win conditions
    if (gameManager.timer <= 0) {
        gameManager.endGame();
        return null; // Signal game over
    }
    
    return gameManager;
}

export { initGame, gameLoop };