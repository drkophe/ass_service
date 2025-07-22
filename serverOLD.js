/**
 * SERVEUR UNIFIÉ - GESTION DES PLACES ET DEMANDES
 * 
 * Ce serveur combine :
 * 1. La gestion des demandes de places (créer, traiter, supprimer)
 * 2. La visualisation en temps réel des zones de la salle
 * 3. La communication entre les deux systèmes
 * 
 * Configuration Railway compatible pour déploiement en ligne
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// ===========================================
// CONFIGURATION DU SERVEUR
// ===========================================

const app = express();
const server = http.createServer(app);

// Configuration Socket.io avec CORS
const io = socketIo(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ["https://votre-domaine.railway.app"] // À remplacer par votre URL Railway
            : "*", // En développement, autorise tout
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ===========================================
// DONNÉES GLOBALES PARTAGÉES
// ===========================================

/**
 * Stockage des demandes de places
 * Chaque demande a un ID unique et un statut
 */
let requests = new Map();

/**
 * État des 10 zones de la salle
 * Ces données sont synchronisées avec les demandes acceptées
 */
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

/**
 * Suivi des utilisateurs connectés
 */
let connectedUsers = 0;
let userCounter = 0;

// ===========================================
// ROUTES EXPRESS
// ===========================================

// Page principale : Gestion des demandes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Page salle : Visualisation des zones
app.get('/salle', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'salle.html'));
});

// API pour récupérer l'état global
app.get('/api/status', (req, res) => {
    res.json({
        requests: Array.from(requests.values()),
        zones: zones,
        connectedUsers: connectedUsers,
        timestamp: new Date().toISOString()
    });
});

// API pour réinitialiser (développement uniquement)
app.post('/api/reset', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Non autorisé en production' });
    }
    
    console.log('🔄 Réinitialisation complète demandée');
    
    // Reset des demandes
    requests.clear();
    
    // Reset des zones
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
    
    // Notification de tous les clients
    io.emit('full_reset', { requests: [], zones: zones });
    
    res.json({ success: true, message: 'Système réinitialisé' });
});

// ===========================================
// FONCTIONS UTILITAIRES
// ===========================================

/**
 * Met à jour automatiquement les places d'une zone
 * Appelée quand une demande est acceptée
 */
function updateZonePlaces(zoneId, placesToRemove, requestId) {
    if (!zones[zoneId]) {
        console.error(`❌ Zone ${zoneId} introuvable`);
        return false;
    }
    
    const zone = zones[zoneId];
    const newValue = Math.max(0, zone.current - placesToRemove);
    
    console.log(`🎯 Mise à jour automatique ${zone.name}: ${zone.current} → ${newValue} (-${placesToRemove} places)`);
    
    zone.current = newValue;
    
    // Notification des clients sur les deux pages
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

/**
 * Vérifie si assez de places sont disponibles dans une zone
 */
function checkZoneAvailability(zoneId, placesNeeded) {
    const zone = zones[zoneId];
    if (!zone) return false;
    return zone.current >= placesNeeded;
}

/**
 * Trouve la meilleure zone disponible pour un nombre de places
 */
function findBestAvailableZone(placesNeeded) {
    const availableZones = Object.entries(zones)
        .filter(([_, zone]) => zone.current >= placesNeeded)
        .sort((a, b) => {
            // Priorité aux zones avec moins de places (optimisation)
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
    
    // Envoi de l'état initial au nouveau client
    socket.emit('initial_data', {
        requests: Array.from(requests.values()),
        zones: zones,
        connectedUsers: connectedUsers
    });
    
    // Notification de tous les clients du nombre d'utilisateurs
    io.emit('users_count', connectedUsers);
    
    // ===========================================
    // GESTION DES DEMANDES (Page principale)
    // ===========================================
    
    /**
     * Création d'une nouvelle demande de place
     */
    socket.on('create_request', (requestData) => {
        try {
            // Validation des données
            if (!requestData.userName || !requestData.placesNeeded) {
                socket.emit('error', 'Données de demande invalides');
                return;
            }
            
            // Création de la demande
            const request = {
                id: uuidv4(),
                userName: requestData.userName.trim(),
                placesNeeded: parseInt(requestData.placesNeeded),
                comment: requestData.comment?.trim() || null,
                status: 'pending',
                timestamp: new Date().toISOString(),
                createdBy: socket.id,
                handledBy: null,
                handledByName: null, // Nom de la personne qui traite
                assignedZone: null // Nouvelle propriété pour la zone assignée
            };
            
            // Validation du nombre de places
            if (request.placesNeeded < 1 || request.placesNeeded > 20) {
                socket.emit('error', 'Nombre de places invalide (1-20)');
                return;
            }
            
            // Stockage de la demande
            requests.set(request.id, request);
            
            console.log(`📨 Nouvelle demande: ${request.userName} - ${request.placesNeeded} places`);
            
            // Diffusion à tous les clients
            io.emit('new_request', request);
            socket.emit('request_created', { success: true, requestId: request.id });
            
        } catch (error) {
            console.error('❌ Erreur création demande:', error);
            socket.emit('error', 'Erreur lors de la création');
        }
    });
    
    /**
     * Mise à jour du statut d'une demande
     * Gère automatiquement les places quand une demande est acceptée
     */
    socket.on('update_request_status', (updateData) => {
        try {
            const { requestId, status, handledBy, handledByName, assignedZone } = updateData;
            
            if (!requests.has(requestId)) {
                socket.emit('error', 'Demande introuvable');
                return;
            }
            
            const request = requests.get(requestId);
            
            // Validation des transitions de statut
            const validTransitions = {
                'pending': ['in-progress'],
                'in-progress': ['available', 'available-separated'], // Plus de retour en pending
                'available': [],
                'available-separated': []
            };
            
            if (!validTransitions[request.status]?.includes(status)) {
                socket.emit('error', `Transition invalide: ${request.status} → ${status}`);
                return;
            }
            
            // Mise à jour de la demande
            const oldStatus = request.status;
            request.status = status;
            request.handledBy = handledBy || socket.id;
            request.handledByName = handledByName || 'Utilisateur anonyme';
            request.lastUpdated = new Date().toISOString();
            
            // Gestion automatique des places pour acceptation (normale ou séparée)
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
                // Auto-assignation de zone si pas spécifiée
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
            
            // Diffusion de la mise à jour
            io.emit('request_updated', request);
            socket.emit('status_updated', { success: true, requestId, status });
            
        } catch (error) {
            console.error('❌ Erreur mise à jour statut:', error);
            socket.emit('error', 'Erreur lors de la mise à jour');
        }
    });
    
    /**
     * Suppression d'une demande
     */
    socket.on('delete_request', (requestId) => {
        try {
            if (!requests.has(requestId)) {
                socket.emit('error', 'Demande introuvable');
                return;
            }
            
            const request = requests.get(requestId);
            
            // Seul le créateur peut supprimer
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
    // GESTION DES ZONES (Page salle)
    // ===========================================
    
    /**
     * Demande des données des zones
     */
    socket.on('request_zones_data', () => {
        socket.emit('zones_data', zones);
    });
    
    /**
     * Mise à jour manuelle d'une zone depuis la page salle
     */
    socket.on('update_zone', (data) => {
        try {
            const { zoneId, newValue, delta } = data;
            
            if (!zoneId || typeof newValue !== 'number' || !zones[zoneId]) {
                socket.emit('error', { message: 'Données de zone invalides' });
                return;
            }
            
            const zone = zones[zoneId];
            
            // Validation des limites
            if (newValue < 0 || newValue > zone.max) {
                socket.emit('error', { 
                    message: `Valeur ${newValue} hors limites pour ${zone.name} (0-${zone.max})`
                });
                return;
            }
            
            const oldValue = zone.current;
            zone.current = newValue;
            
            console.log(`🎛️ Mise à jour manuelle ${zone.name}: ${oldValue} → ${newValue} (${delta > 0 ? '+' : ''}${delta})`);
            
            // Notification de tous les clients
            io.emit('zone_updated', {
                zoneId: zoneId,
                current: newValue,
                previous: oldValue,
                delta: delta,
                updatedBy: userId,
                manual: true, // Indique que c'est une modification manuelle
                timestamp: new Date().toISOString()
            });
            
            socket.emit('update_confirmed', { zoneId, newValue });
            
        } catch (error) {
            console.error('❌ Erreur mise à jour zone:', error);
            socket.emit('error', { message: 'Erreur serveur' });
        }
    });
    
    // ===========================================
    // GESTION DE LA DÉCONNEXION
    // ===========================================
    
    socket.on('disconnect', (reason) => {
        connectedUsers--;
        console.log(`🔴 ${userId} déconnecté (${reason}) - Restant: ${connectedUsers}`);
        
        io.emit('users_count', connectedUsers);
        
        // Remettre en attente les demandes "en cours" de cet utilisateur
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

/**
 * Nettoyage périodique des anciennes demandes
 */
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
}, 60 * 60 * 1000); // Vérification toutes les heures

/**
 * Sauvegarde périodique des statistiques
 */
setInterval(() => {
    const stats = {
        timestamp: new Date().toISOString(),
        totalRequests: requests.size,
        totalPlaces: Object.values(zones).reduce((sum, zone) => sum + zone.current, 0),
        maxPlaces: Object.values(zones).reduce((sum, zone) => sum + zone.max, 0),
        connectedUsers: connectedUsers
    };
    
    console.log('📊 Stats:', stats);
}, 5 * 60 * 1000); // Toutes les 5 minutes

// ===========================================
// DÉMARRAGE DU SERVEUR
// ===========================================

server.listen(PORT, () => {
    console.log('🚀 ==========================================');
    console.log(`🚀 Serveur Places & Demandes démarré`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🚀 Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log('🚀 ==========================================');
    console.log('📄 Pages disponibles:');
    console.log(`   • Demandes: http://localhost:${PORT}/`);
    console.log(`   • Salle:    http://localhost:${PORT}/salle`);
    console.log('🚀 ==========================================');
    console.log('📊 État initial:');
    
    Object.entries(zones).forEach(([zoneId, zone]) => {
        console.log(`   ${zone.name}: ${zone.current}/${zone.max} places`);
    });
    
    console.log('🚀 ==========================================');
    console.log('✅ Serveur prêt à accepter les connexions');
});

// Gestion de l'arrêt propre
process.on('SIGTERM', () => {
    console.log('🛑 Arrêt du serveur...');
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
    console.error('❌ Erreur non capturée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesse rejetée:', reason);
});

module.exports = { server, io, zones, requests };