#!/usr/bin/env node

/**
 * Script de mise à jour automatique des listes d'utilisateurs
 * 
 * Usage: node update-users.js [options]
 * 
 * Options:
 *   --check    Vérifie la cohérence des listes sans modifier
 *   --update   Met à jour tous les fichiers HTML
 *   --backup   Crée une sauvegarde avant modification
 */

const fs = require('fs');
const path = require('path');

// Import de la configuration des utilisateurs
const { USERS_LIST, generateUserOptions } = require('./users-config.js');

const FILES_TO_UPDATE = [
    {
        path: 'public/index.html',
        selectors: [
            { id: 'userName', emptyText: 'Sélectionnez votre nom' },
            { id: 'handlerName', emptyText: 'Qui traite cette demande ?' }
        ]
    },
    {
        path: 'public/planning.html',
        selectors: [
            { id: 'userFilter', emptyText: 'Tous les utilisateurs', includeAll: true },
            { id: 'adminUser', emptyText: 'Sélectionner un utilisateur' }
        ]
    }
];

/**
 * Lit le contenu d'un fichier
 */
function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`❌ Erreur lecture ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Écrit le contenu dans un fichier
 */
function writeFile(filePath, content) {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ ${filePath} mis à jour`);
        return true;
    } catch (error) {
        console.error(`❌ Erreur écriture ${filePath}:`, error.message);
        return false;
    }
}

/**
 * Crée une sauvegarde d'un fichier
 */
function createBackup(filePath) {
    const backupPath = `${filePath}.backup-${new Date().getTime()}`;
    try {
        fs.copyFileSync(filePath, backupPath);
        console.log(`💾 Sauvegarde créée: ${backupPath}`);
        return backupPath;
    } catch (error) {
        console.error(`❌ Erreur sauvegarde ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Génère les options HTML pour un sélecteur
 */
function generateOptionsForSelector(selector) {
    let options = '';
    
    // Option "Tous" pour les filtres
    if (selector.includeAll) {
        options += `                        <option value="all">Tous les utilisateurs</option>\n`;
    } else {
        // Option vide par défaut
        options += `                            <option value="">${selector.emptyText}</option>\n`;
    }
    
    // Options des utilisateurs
    USERS_LIST.forEach(user => {
        const indent = selector.includeAll ? '                        ' : '                            ';
        options += `${indent}<option value="${user}">${user}</option>\n`;
    });
    
    return options.trimEnd(); // Supprimer le dernier \n
}

/**
 * Met à jour un sélecteur dans le contenu HTML
 */
function updateSelectorInContent(content, selector) {
    const newOptions = generateOptionsForSelector(selector);
    
    // Pattern pour trouver le <select> avec l'id spécifique
    const selectPattern = new RegExp(
        `(<select[^>]*id="${selector.id}"[^>]*>)\\s*([\\s\\S]*?)\\s*(</select>)`,
        'gm'
    );
    
    const match = content.match(selectPattern);
    if (!match) {
        console.warn(`⚠️  Sélecteur #${selector.id} introuvable`);
        return content;
    }
    
    // Remplacer le contenu du select
    const updatedContent = content.replace(selectPattern, `$1\n${newOptions}\n                        $3`);
    
    console.log(`🔄 Sélecteur #${selector.id} mis à jour (${USERS_LIST.length} utilisateurs)`);
    
    return updatedContent;
}

/**
 * Met à jour un fichier HTML
 */
function updateHtmlFile(fileConfig, createBackups = false) {
    const { path: filePath, selectors } = fileConfig;
    
    console.log(`\n📄 Traitement de ${filePath}...`);
    
    // Vérifier l'existence du fichier
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Fichier introuvable: ${filePath}`);
        return false;
    }
    
    // Lire le contenu actuel
    let content = readFile(filePath);
    if (!content) return false;
    
    // Créer une sauvegarde si demandé
    if (createBackups) {
        createBackup(filePath);
    }
    
    // Mettre à jour chaque sélecteur
    let updated = false;
    selectors.forEach(selector => {
        const originalContent = content;
        content = updateSelectorInContent(content, selector);
        if (content !== originalContent) {
            updated = true;
        }
    });
    
    // Écrire le fichier modifié
    if (updated) {
        return writeFile(filePath, content);
    } else {
        console.log(`ℹ️  Aucune modification nécessaire pour ${filePath}`);
        return true;
    }
}

/**
 * Vérifie la cohérence des listes d'utilisateurs
 */
function checkConsistency() {
    console.log('🔍 Vérification de la cohérence des listes d\'utilisateurs...\n');
    
    let allConsistent = true;
    
    FILES_TO_UPDATE.forEach(fileConfig => {
        const { path: filePath, selectors } = fileConfig;
        
        console.log(`📄 Vérification de ${filePath}...`);
        
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Fichier introuvable: ${filePath}`);
            allConsistent = false;
            return;
        }
        
        const content = readFile(filePath);
        if (!content) {
            allConsistent = false;
            return;
        }
        
        selectors.forEach(selector => {
            // Compter les utilisateurs dans le fichier
            const userMatches = content.match(new RegExp(`<option value="[^"]*">[^<]+</option>`, 'g')) || [];
            const fileUserCount = userMatches.filter(match => !match.includes('Tous les utilisateurs') && !match.includes('Sélectionn')).length;
            
            if (fileUserCount !== USERS_LIST.length) {
                console.warn(`⚠️  Incohérence détectée dans #${selector.id}: ${fileUserCount} utilisateurs trouvés, ${USERS_LIST.length} attendus`);
                allConsistent = false;
            } else {
                console.log(`✅ #${selector.id}: ${fileUserCount} utilisateurs (cohérent)`);
            }
        });
        
        console.log('');
    });
    
    return allConsistent;
}

/**
 * Met à jour tous les fichiers
 */
function updateAllFiles(createBackups = false) {
    console.log('🚀 Mise à jour de tous les fichiers HTML...\n');
    console.log(`📊 Liste de référence: ${USERS_LIST.length} utilisateurs\n`);
    
    let allSuccess = true;
    
    FILES_TO_UPDATE.forEach(fileConfig => {
        const success = updateHtmlFile(fileConfig, createBackups);
        if (!success) {
            allSuccess = false;
        }
    });
    
    console.log('\n' + '='.repeat(50));
    if (allSuccess) {
        console.log('✅ Mise à jour terminée avec succès!');
    } else {
        console.log('❌ Certains fichiers n\'ont pas pu être mis à jour');
    }
    console.log('='.repeat(50));
    
    return allSuccess;
}

/**
 * Affiche l'aide
 */
function showHelp() {
    console.log(`
🔧 Script de mise à jour des listes d'utilisateurs
═══════════════════════════════════════════════════

Usage: node update-users.js [options]

Options:
  --check     Vérifie la cohérence des listes sans modifier les fichiers
  --update    Met à jour tous les fichiers HTML avec la nouvelle liste
  --backup    Crée une sauvegarde avant modification (à utiliser avec --update)
  --help      Affiche cette aide

Exemples:
  node update-users.js --check                    # Vérification seulement
  node update-users.js --update                   # Mise à jour simple
  node update-users.js --update --backup          # Mise à jour avec sauvegarde

Fichiers traités:
  📄 public/index.html (sélecteurs: #userName, #handlerName)
  📄 public/planning.html (sélecteurs: #userFilter, #adminUser)

Configuration:
  📋 ${USERS_LIST.length} utilisateurs définis dans users-config.js
    `);
}

/**
 * Point d'entrée principal
 */
function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help')) {
        showHelp();
        return;
    }
    
    console.log('🎯 Script de mise à jour des listes d\'utilisateurs');
    console.log('═'.repeat(60));
    console.log(`📋 Configuration: ${USERS_LIST.length} utilisateurs\n`);
    
    if (args.includes('--check')) {
        const consistent = checkConsistency();
        process.exit(consistent ? 0 : 1);
    }
    
    if (args.includes('--update')) {
        const createBackups = args.includes('--backup');
        const success = updateAllFiles(createBackups);
        process.exit(success ? 0 : 1);
    }
    
    // Si aucune option reconnue
    console.error('❌ Option non reconnue. Utilisez --help pour voir l\'aide.');
    process.exit(1);
}

// Exécuter le script si appelé directement
if (require.main === module) {
    main();
}

module.exports = {
    updateHtmlFile,
    checkConsistency,
    updateAllFiles,
    FILES_TO_UPDATE
};