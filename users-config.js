/**
 * Configuration centralisée des utilisateurs
 * Fichier de référence pour maintenir la liste des noms
 */

const USERS_LIST = [
    'ALLOWAKINOU Serge',
    'AMBROISE Kevin',
    'BAZARD Gwen',
    'BEIGNEUX Hugo',
    'BILLIERE Clément',
    'BOSI Lorenzo',
    'BOUILLER Laurent',
    'BOYER Fabien',
    'BREARD Frédérique',
    'COUCHY-ROMAIN Rony',
    'DAMYS Geoffrey',
    'DJONFO Sylvio',
    'DUCHÈNE Mathieu',
    'FEBRISSY Jason',
    'FORTUNÉ Nicolas',
    'GILBERT Fabrice',
    'JEAN Thierry',
    'KHALED Jason',
    'KONAN Josué',
    'KONAN Justin',
    'KOULONI Yannick',
    'KOUNI Espoir',
    'LADAS Georges',
    'LADAS Killian',
    'LALANDE Samuel',
    'LE STANG Sylvain',
    'LEJEUNE Raphaël',
    'LESAGE Adrien',
    'LINA Thierry',
    'LOHATODÉ Isaac',
    'LUCE Franck',
    'MAPOLIN Gilbert',
    'MATUSZAK Benjamin',
    'MEDINA Mathieu',
    'MEILLER Neal',
    'MESSUD Jeremie',
    'MILLIÈRE Adriel',
    'MIZÈLE Sohann',
    'MONDOLUS Olondieu',
    'MOPALIN Gilbert',
    'MOUELLE Louis',
    'NGOMA Maxence',
    'NGOMA Vince',
    'NJANTA Léonard',
    'NSONGA Jonathan',
    'ONCOMODE Andrew',
    'PAMBOU Loic',
    'PINARD Johan',
    'RABIN Sébastien',
    'RABIN Timothy',
    'RAINASOA Fitia',
    'RAINASOA Naina',
    'SONÉ KELLE Axel',
    'TABET Jason',
    'TIMOTHÉE Vanden',
    'TOUROUDE John',
    'VAN DE CASTELE Simon',
    'VANDENBUSSCHE Timothée',
    'VARATAJAN Seron',
    'VELOSO Enzo',
    'VOITIER Manoah'
];

/**
 * Génère les options HTML pour un élément <select>
 * @param {string} emptyOptionText - Texte de l'option vide (optionnel)
 * @returns {string} HTML des options
 */
function generateUserOptions(emptyOptionText = 'Sélectionnez votre nom') {
    let options = `<option value="">${emptyOptionText}</option>\n`;
    
    USERS_LIST.forEach(user => {
        options += `                            <option value="${user}">${user}</option>\n`;
    });
    
    return options;
}

/**
 * Génère le code JavaScript pour initialiser un tableau des utilisateurs
 * @returns {string} Code JavaScript
 */
function generateUserArrayJS() {
    return `const USERS = [
${USERS_LIST.map(user => `    '${user}'`).join(',\n')}
];`;
}

/**
 * Vérifie si un nom d'utilisateur est valide
 * @param {string} userName - Nom à vérifier
 * @returns {boolean} True si le nom est dans la liste
 */
function isValidUser(userName) {
    return USERS_LIST.includes(userName);
}

/**
 * Recherche des utilisateurs par nom partiel
 * @param {string} searchTerm - Terme de recherche
 * @returns {Array} Liste des utilisateurs correspondants
 */
function searchUsers(searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') {
        return USERS_LIST;
    }
    
    const term = searchTerm.toLowerCase();
    return USERS_LIST.filter(user => 
        user.toLowerCase().includes(term)
    );
}

/**
 * Trie les utilisateurs par nom de famille
 * @returns {Array} Liste triée des utilisateurs
 */
function getUsersSortedByLastName() {
    return [...USERS_LIST].sort((a, b) => {
        const lastNameA = a.split(' ').pop();
        const lastNameB = b.split(' ').pop();
        return lastNameA.localeCompare(lastNameB);
    });
}

/**
 * Trie les utilisateurs par prénom
 * @returns {Array} Liste triée des utilisateurs
 */
function getUsersSortedByFirstName() {
    return [...USERS_LIST].sort((a, b) => {
        const firstNameA = a.split(' ')[0];
        const firstNameB = b.split(' ')[0];
        return firstNameA.localeCompare(firstNameB);
    });
}

/**
 * Statistiques sur la liste des utilisateurs
 * @returns {Object} Objet contenant les statistiques
 */
function getUserStats() {
    const firstNames = USERS_LIST.map(user => user.split(' ')[0]);
    const lastNames = USERS_LIST.map(user => user.split(' ').slice(1).join(' '));
    
    return {
        total: USERS_LIST.length,
        uniqueFirstNames: [...new Set(firstNames)].length,
        uniqueLastNames: [...new Set(lastNames)].length,
        longestName: USERS_LIST.reduce((longest, current) => 
            current.length > longest.length ? current : longest, ''),
        shortestName: USERS_LIST.reduce((shortest, current) => 
            current.length < shortest.length ? current : shortest, USERS_LIST[0] || '')
    };
}

// Export pour Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        USERS_LIST,
        generateUserOptions,
        generateUserArrayJS,
        isValidUser,
        searchUsers,
        getUsersSortedByLastName,
        getUsersSortedByFirstName,
        getUserStats
    };
}

// Export pour les navigateurs (global)
if (typeof window !== 'undefined') {
    window.UsersConfig = {
        USERS_LIST,
        generateUserOptions,
        generateUserArrayJS,
        isValidUser,
        searchUsers,
        getUsersSortedByLastName,
        getUsersSortedByFirstName,
        getUserStats
    };
}

// Utilisation en Node.js pour générer les fichiers HTML
if (typeof process !== 'undefined' && process.argv && process.argv[2] === '--generate') {
    console.log('='.repeat(60));
    console.log('CONFIGURATION DES UTILISATEURS');
    console.log('='.repeat(60));
    console.log(`Total: ${USERS_LIST.length} utilisateurs`);
    console.log('');
    
    const stats = getUserStats();
    console.log('Statistiques:');
    console.log(`- Noms totaux: ${stats.total}`);
    console.log(`- Prénoms uniques: ${stats.uniqueFirstNames}`);
    console.log(`- Noms de famille uniques: ${stats.uniqueLastNames}`);
    console.log(`- Nom le plus long: ${stats.longestName} (${stats.longestName.length} caractères)`);
    console.log(`- Nom le plus court: ${stats.shortestName} (${stats.shortestName.length} caractères)`);
    console.log('');
    
    console.log('Options HTML pour <select>:');
    console.log('─'.repeat(40));
    console.log(generateUserOptions('Sélectionnez un utilisateur'));
    console.log('');
    
    console.log('Tableau JavaScript:');
    console.log('─'.repeat(40));
    console.log(generateUserArrayJS());
    console.log('');
    
    console.log('Liste triée par nom de famille:');
    console.log('─'.repeat(40));
    getUsersSortedByLastName().forEach((user, index) => {
        console.log(`${(index + 1).toString().padStart(2, '0')}. ${user}`);
    });
}