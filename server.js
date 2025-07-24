/**
 * SERVEUR UNIFIÉ - GESTION DES PLACES ET DEMANDES
 * 
 * Version optimisée mobile sans notifications
 * Configuration Render compatible pour déploiement gratuit
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

// ===========================================
// CONFIGURATION DU SERVEUR
// ===========================================

const app = express();
const server = http.createServer(app);

// Configuration Socket.io avec CORS pour Render
const io = socketIo(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? [
                /\.onrender\.com$/,
                "https://your-app-name.onrender.com" // Remplacez par votre URL Render
              ]
            : "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 10000;

// ===========================================
// DONNÉES GLOBALES PARTAGÉES
// ===========================================

let requests = new Map();

let zones = {
    'zone-d': { current: 122, max: 122, name: 'Zone D' },
    'zone-c': { current: 160, max: 160, name: 'Zone C' },
    'zone-b': { current: 122, max: 122, name: 'Zone B' },
    'zone-e': { current: 147, max: 147, name: 'Zone E' },
    'zone-f': { current: 146, max: 146, name: 'Zone F' },
    'zone-g': { current: 137, max: 137, name: 'Zone G' },
    'zone-j': { current: 105, max: 105, name: 'Zone J' },
    'zone-i': { current: 264, max: 264, name: 'Zone I' },
    'zone-h': { current: 97, max: 97, name: 'Zone H' },
    'zone-l': { current: 109, max: 109, name: 'Zone L (Salle secondaire)' }
};

let connectedUsers = 0;
let userCounter = 0;

// ===========================================
// DONNÉES DU PLANNING
// ===========================================

let planningData = {
    vendredi: [],
    samedi: [],
    dimanche: []
};

const PLANNING_FILE = 'planning-data.json';

// Charger les données du planning au démarrage
async function loadPlanningData() {
    try {
        const data = await fs.readFile(PLANNING_FILE, 'utf8');
        planningData = JSON.parse(data);
        console.log('📅 Données du planning chargées');
    } catch (error) {
        console.log('📅 Aucune donnée de planning trouvée, création d\'un nouveau fichier');
        await savePlanningData();
    }
}

// Sauvegarder les données du planning
async function savePlanningData() {
    try {
        await fs.writeFile(PLANNING_FILE, JSON.stringify(planningData, null, 2));
        console.log('💾 Données du planning sauvegardées');
    } catch (error) {
        console.error('❌ Erreur sauvegarde planning:', error);
    }
}

// ===========================================
// ROUTES EXPRESS
// ===========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/salle', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'salle.html'));
});

app.get('/planning', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'planning.html'));
});

app.get('/api/status', (req, res) => {
    res.json({
        status: 'healthy',
        requests: Array.from(requests.values()),
        zones: zones,
        connectedUsers: connectedUsers,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/reset', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Non autorisé en production' });
    }
    
    console.log('🔄 Réinitialisation complète demandée');
    
    requests.clear();
    
    zones = {
        'zone-d': { current: 122, max: 122, name: 'Zone D' },
        'zone-c': { current: 160, max: 160, name: 'Zone C' },
        'zone-b': { current: 122, max: 122, name: 'Zone B' },
        'zone-e': { current: 147, max: 147, name: 'Zone E' },
        'zone-f': { current: 146, max: 146, name: 'Zone F' },
        'zone-g': { current: 137, max: 137, name: 'Zone G' },
        'zone-j': { current: 105, max: 105, name: 'Zone J' },
        'zone-i': { current: 264, max: 264, name: 'Zone I' },
        'zone-h': { current: 97, max: 97, name: 'Zone H' },
        'zone-l': { current: 109, max: 109, name: 'Zone L (Salle secondaire)' }
    };
    
    io.emit('full_reset', { requests: [], zones: zones });
    
    res.json({ success: true, message: 'Système réinitialisé' });
});

// ===========================================
// FONCTIONS UTILITAIRES
// ===========================================

function updateZonePlaces(zoneId, placesToRemove, requestId) {
    if (!zones[zoneId]) {
        console.error(`❌ Zone ${zoneId} introuvable`);
        return false;
    }
    
    const zone = zones[zoneId];
    const newValue = Math.max(0, zone.current - placesToRemove);
    
    console.log(`🎯 Mise à jour automatique ${zone.name}: ${zone.current} → ${newValue} (-${placesToRemove} places)`);
    
    zone.current = newValue;
    
    io.emit('zone_updated_from_request', {
        zoneId: zoneId,
        current: newValue,
        previous: zone.current + placesToRemove,
        placesRemoved: placesToRemove,
        requestId: requestId,
        timestamp: new Date().toISOString()
    });
    
    return true;
}

function checkZoneAvailability(zoneId, placesNeeded) {
    const zone = zones[zoneId];
    if (!zone) return false;
    return zone.current >= placesNeeded;
}

function findBestAvailableZone(placesNeeded) {
    const availableZones = Object.entries(zones)
        .filter(([_, zone]) => zone.current >= placesNeeded)
        .sort((a, b) => {
            return a[1].current - b[1].current;
        });
    
    return availableZones.length > 0 ? availableZones[0][0] : null;
}

// ===========================================
// GESTION DES CONNEXIONS SOCKET.IO
// ===========================================

io.on('connection', (socket) => {
    connectedUsers++;
    const userId = `user_${++userCounter}`;
    
    console.log(`🟢 ${userId} connecté (${socket.id}) - Total: ${connectedUsers}`);
    
    socket.emit('initial_data', {
        requests: Array.from(requests.values()),
        zones: zones,
        connectedUsers: connectedUsers
    });
    
    io.emit('users_count', connectedUsers);
    
    // ===========================================
    // GESTION DES DEMANDES
    // ===========================================
    
    socket.on('create_request', (requestData) => {
        try {
            if (!requestData.userName || !requestData.placesNeeded) {
                socket.emit('error', 'Données de demande invalides');
                return;
            }
            
            const request = {
                id: uuidv4(),
                userName: requestData.userName.trim(),
                placesNeeded: parseInt(requestData.placesNeeded),
                comment: requestData.comment?.trim() || null,
                status: 'pending',
                timestamp: new Date().toISOString(),
                createdBy: socket.id,
                handledBy: null,
                handledByName: null,
                assignedZone: null
            };
            
            if (request.placesNeeded < 1 || request.placesNeeded > 20) {
                socket.emit('error', 'Nombre de places invalide (1-20)');
                return;
            }
            
            requests.set(request.id, request);
            
            console.log(`📨 Nouvelle demande: ${request.userName} - ${request.placesNeeded} places`);
            
            io.emit('new_request', request);
            socket.emit('request_created', { success: true, requestId: request.id });
            
        } catch (error) {
            console.error('❌ Erreur création demande:', error);
            socket.emit('error', 'Erreur lors de la création');
        }
    });
    
    socket.on('update_request_status', (updateData) => {
        try {
            const { requestId, status, handledBy, handledByName, assignedZone } = updateData;
            
            if (!requests.has(requestId)) {
                socket.emit('error', 'Demande introuvable');
                return;
            }
            
            const request = requests.get(requestId);
            
            const validTransitions = {
                'pending': ['in-progress'],
                'in-progress': ['available', 'available-separated', 'pending'], // Permettre le retour à pending
                'available': [],
                'available-separated': []
            };
            
            if (!validTransitions[request.status]?.includes(status)) {
                socket.emit('error', `Transition invalide: ${request.status} → ${status}`);
                return;
            }
            
            const oldStatus = request.status;
            request.status = status;
            request.handledBy = handledBy || socket.id;
            request.handledByName = handledByName || 'Utilisateur anonyme';
            request.lastUpdated = new Date().toISOString();
            
            if ((status === 'available' || status === 'available-separated') && assignedZone) {
                if (checkZoneAvailability(assignedZone, request.placesNeeded)) {
                    request.assignedZone = assignedZone;
                    updateZonePlaces(assignedZone, request.placesNeeded, request.id);
                    const statusText = status === 'available-separated' ? 'acceptée (places séparées)' : 'acceptée';
                    console.log(`✅ Demande ${request.id} ${statusText} - ${request.placesNeeded} places retirées de ${assignedZone}`);
                } else {
                    socket.emit('error', `Pas assez de places en ${assignedZone}`);
                    return;
                }
            } else if ((status === 'available' || status === 'available-separated') && !assignedZone) {
                const bestZone = findBestAvailableZone(request.placesNeeded);
                if (bestZone) {
                    request.assignedZone = bestZone;
                    updateZonePlaces(bestZone, request.placesNeeded, request.id);
                    console.log(`✅ Demande ${request.id} auto-assignée à ${bestZone}`);
                } else {
                    socket.emit('error', 'Aucune zone disponible pour cette demande');
                    return;
                }
            }
            
            requests.set(requestId, request);
            
            console.log(`🔄 Demande ${requestId}: ${oldStatus} → ${status}`);
            
            io.emit('request_updated', request);
            socket.emit('status_updated', { success: true, requestId, status });
            
        } catch (error) {
            console.error('❌ Erreur mise à jour statut:', error);
            socket.emit('error', 'Erreur lors de la mise à jour');
        }
    });
    
    /**
     * Abandon d'une demande en cours de traitement
     */
    socket.on('abandon_request', (data) => {
        try {
            const { requestId } = data;
            
            if (!requests.has(requestId)) {
                socket.emit('error', 'Demande introuvable');
                return;
            }
            
            const request = requests.get(requestId);
            
            // Vérifier que la demande est bien en cours et traitée par cet utilisateur
            if (request.status !== 'in-progress') {
                socket.emit('error', 'Cette demande n\'est pas en cours de traitement');
                return;
            }
            
            if (request.handledBy !== socket.id) {
                socket.emit('error', 'Vous ne pouvez abandonner que vos propres traitements');
                return;
            }
            
            // Remettre la demande en attente
            request.status = 'pending';
            request.handledBy = null;
            request.handledByName = null;
            request.lastUpdated = new Date().toISOString();
            
            requests.set(requestId, request);
            
            console.log(`↩️ Demande ${requestId} abandonnée et remise en attente`);
            
            // Notifier tous les clients
            io.emit('request_abandoned', { requestId });
            io.emit('request_updated', request);
            socket.emit('abandon_confirmed', { success: true, requestId });
            
        } catch (error) {
            console.error('❌ Erreur abandon demande:', error);
            socket.emit('error', 'Erreur lors de l\'abandon');
        }
    });
    
    socket.on('delete_request', (requestId) => {
        try {
            if (!requests.has(requestId)) {
                socket.emit('error', 'Demande introuvable');
                return;
            }
            
            const request = requests.get(requestId);
            
            if (request.createdBy !== socket.id) {
                socket.emit('error', 'Vous ne pouvez supprimer que vos propres demandes');
                return;
            }
            
            requests.delete(requestId);
            console.log(`🗑️ Demande ${requestId} supprimée`);
            
            io.emit('request_deleted', { requestId });
            
        } catch (error) {
            console.error('❌ Erreur suppression:', error);
            socket.emit('error', 'Erreur lors de la suppression');
        }
    });
    
    // ===========================================
    // GESTION DES ZONES
    // ===========================================
    
    socket.on('request_zones_data', () => {
        socket.emit('zones_data', zones);
    });
    
    socket.on('update_zone', (data) => {
        try {
            const { zoneId, newValue, delta } = data;
            
            if (!zoneId || typeof newValue !== 'number' || !zones[zoneId]) {
                socket.emit('error', { message: 'Données de zone invalides' });
                return;
            }
            
            const zone = zones[zoneId];
            
            if (newValue < 0 || newValue > zone.max) {
                socket.emit('error', { 
                    message: `Valeur ${newValue} hors limites pour ${zone.name} (0-${zone.max})`
                });
                return;
            }
            
            const oldValue = zone.current;
            zone.current = newValue;
            
            console.log(`🎛️ Mise à jour manuelle ${zone.name}: ${oldValue} → ${newValue} (${delta > 0 ? '+' : ''}${delta})`);
            
            io.emit('zone_updated', {
                zoneId: zoneId,
                current: newValue,
                previous: oldValue,
                delta: delta,
                updatedBy: userId,
                manual: true,
                timestamp: new Date().toISOString()
            });
            
            socket.emit('update_confirmed', { zoneId, newValue });
            
        } catch (error) {
            console.error('❌ Erreur mise à jour zone:', error);
            socket.emit('error', { message: 'Erreur serveur' });
        }
    });
    
    // ===========================================
    // GESTION DU PLANNING
    // ===========================================
    
    socket.on('request_planning_data', () => {
        socket.emit('planning_data', planningData);
    });
    
    socket.on('add_assignment', async (assignment) => {
        try {
            // Validation des données
            if (!assignment.day || !assignment.user || !assignment.service || 
                !assignment.startTime || !assignment.endTime) {
                socket.emit('error', 'Données d\'affectation invalides');
                return;
            }
            
            // Ajouter un ID unique
            assignment.id = uuidv4();
            
            // Vérifier les conflits
            const dayAssignments = planningData[assignment.day] || [];
            const hasConflict = dayAssignments.some(a => {
                if (a.user !== assignment.user) return false;
                
                // Convertir les heures en minutes pour faciliter la comparaison
                const toMinutes = (time) => {
                    const [h, m] = time.split(':').map(Number);
                    return h * 60 + m;
                };
                
                const newStart = toMinutes(assignment.startTime);
                const newEnd = toMinutes(assignment.endTime);
                const existingStart = toMinutes(a.startTime);
                const existingEnd = toMinutes(a.endTime);
                
                // Vérifier le chevauchement
                return (newStart < existingEnd && newEnd > existingStart);
            });
            
            if (hasConflict) {
                socket.emit('error', 'Conflit d\'horaire : l\'utilisateur est déjà affecté sur ce créneau');
                return;
            }
            
            // Ajouter l'affectation
            if (!planningData[assignment.day]) {
                planningData[assignment.day] = [];
            }
            planningData[assignment.day].push(assignment);
            
            // Trier par heure de début
            planningData[assignment.day].sort((a, b) => {
                return a.startTime.localeCompare(b.startTime);
            });
            
            // Sauvegarder
            await savePlanningData();
            
            console.log(`📅 Nouvelle affectation: ${assignment.user} - ${assignment.service}`);
            
            // Notifier tous les clients
            io.emit('planning_updated', planningData);
            io.emit('assignment_added', assignment);
            
        } catch (error) {
            console.error('❌ Erreur ajout affectation:', error);
            socket.emit('error', 'Erreur lors de l\'ajout');
        }
    });
    
    socket.on('delete_assignment', async (data) => {
        try {
            const { id } = data;
            let found = false;
            
            // Parcourir tous les jours pour trouver et supprimer l'affectation
            for (const day of Object.keys(planningData)) {
                const index = planningData[day].findIndex(a => a.id === id);
                if (index !== -1) {
                    planningData[day].splice(index, 1);
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                socket.emit('error', 'Affectation introuvable');
                return;
            }
            
            // Sauvegarder
            await savePlanningData();
            
            console.log(`🗑️ Affectation supprimée: ${id}`);
            
            // Notifier tous les clients
            io.emit('planning_updated', planningData);
            io.emit('assignment_deleted', { id });
            
        } catch (error) {
            console.error('❌ Erreur suppression affectation:', error);
            socket.emit('error', 'Erreur lors de la suppression');
        }
    });
    
    // ===========================================
    // GESTION DE LA DÉCONNEXION
    // ===========================================
    
    socket.on('disconnect', (reason) => {
        connectedUsers--;
        console.log(`🔴 ${userId} déconnecté (${reason}) - Restant: ${connectedUsers}`);
        
        io.emit('users_count', connectedUsers);
        
        for (let [id, request] of requests) {
            if (request.handledBy === socket.id && request.status === 'in-progress') {
                request.status = 'pending';
                request.handledBy = null;
                requests.set(id, request);
                
                console.log(`🔄 Demande ${id} remise en attente après déconnexion`);
                io.emit('request_updated', request);
            }
        }
    });
    
    socket.on('error', (error) => {
        console.error(`❌ Erreur socket ${userId}:`, error);
    });
});

// ===========================================
// TÂCHES DE MAINTENANCE
// ===========================================

setInterval(() => {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 heures
    
    for (let [id, request] of requests) {
        const age = now - new Date(request.timestamp);
        if (age > maxAge && ['available', 'not-available', 'available-separated'].includes(request.status)) {
            requests.delete(id);
            console.log(`🧹 Demande expirée supprimée: ${id}`);
            io.emit('request_deleted', { requestId: id });
        }
    }
}, 60 * 60 * 1000);

setInterval(() => {
    const stats = {
        timestamp: new Date().toISOString(),
        totalRequests: requests.size,
        totalPlaces: Object.values(zones).reduce((sum, zone) => sum + zone.current, 0),
        maxPlaces: Object.values(zones).reduce((sum, zone) => sum + zone.max, 0),
        connectedUsers: connectedUsers
    };
    
    console.log('📊 Stats:', stats);
}, 5 * 60 * 1000);

// ===========================================
// DÉMARRAGE DU SERVEUR
// ===========================================

server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 ==========================================');
    console.log(`🚀 Serveur Places & Demandes démarré (Mobile Optimized)`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🚀 Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log('🚀 ==========================================');
    console.log('📄 Pages disponibles:');
    console.log(`   • Demandes: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/`);
    console.log(`   • Salle:    ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/salle`);
    console.log(`   • Planning: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/planning`);
    console.log('🚀 ==========================================');
    console.log('📊 État initial:');
    
    Object.entries(zones).forEach(([zoneId, zone]) => {
        console.log(`   ${zone.name}: ${zone.current}/${zone.max} places`);
    });
    
    console.log('🚀 ==========================================');
    console.log('✅ Serveur prêt à accepter les connexions');
});

// Charger les données du planning au démarrage
loadPlanningData().then(() => {
    console.log('📅 Module planning initialisé');
});

process.on('SIGTERM', () => {
    console.log('🛑 Arrêt du serveur...');
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Interruption reçue, arrêt du serveur...');
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error('❌ Erreur non capturée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesse rejetée:', reason);
});

module.exports = { server, io, zones, requests };