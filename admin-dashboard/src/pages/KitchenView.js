import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getOrders, updateOrderStatus, kitchenLogin } from '../services/api';
import { isStoreOpenFromLocal } from '../utils/storeHoursLocal';
import '../styles/KitchenView.css';

// Notification sound URL (served from public folder)
const NOTIFICATION_SOUND_URL = '/sounds/mixkitBeep.mp3';

// Kitchen token storage key prefix
const KITCHEN_TOKEN_KEY_PREFIX = 'savor_kitchen_token_';

// Default ETA fallbacks by order type (minutes)
const DEFAULT_ETA_BY_TYPE = {
  pickup: 20,
  delivery: 40,
  'dine-in': 15,
};

// Urgent threshold: 5 minutes before due or overdue
const URGENT_THRESHOLD_MS = 5 * 60 * 1000;

// Long-press duration for completion (ms)
const HOLD_TO_COMPLETE_MS = 1000;

// Visible grid size
const GRID_SIZE = 6;

/**
 * Normalize an order to include all computed fields
 */
function normalizeOrder(order, nowMs) {
  const orderType = order.orderType || order.type || 'pickup';
  // Use sequential orderNumber if available, otherwise fall back to last 6 chars of orderId
  const orderNumber = order.orderNumber 
    ? String(order.orderNumber) 
    : (order.orderId ? order.orderId.slice(-6).toUpperCase() : '??????');
  const createdAtMs = order.createdAtMs || new Date(order.createdAt).getTime();
  
  // Determine ETA - use etaMaxMinutes if available, otherwise use type-based default
  let etaMaxMinutes = order.etaMaxMinutes;
  let etaDefault = false;
  
  if (etaMaxMinutes == null || isNaN(etaMaxMinutes)) {
    etaMaxMinutes = DEFAULT_ETA_BY_TYPE[orderType] || DEFAULT_ETA_BY_TYPE.pickup;
    etaDefault = true;
  }
  
  const dueAtMs = createdAtMs + etaMaxMinutes * 60 * 1000;
  const timeUntilDueMs = dueAtMs - nowMs;
  const isUrgent = timeUntilDueMs <= URGENT_THRESHOLD_MS;
  const isOverdue = timeUntilDueMs < 0;
  
  return {
    ...order,
    orderType,
    orderNumber,
    createdAtMs,
    etaMaxMinutes,
    etaMinMinutes: order.etaMinMinutes,
    etaText: order.etaText,
    etaDefault,
    dueAtMs,
    timeUntilDueMs,
    isUrgent,
    isOverdue,
  };
}

/**
 * Format due time for display
 */
function formatDueTime(dueAtMs) {
  const date = new Date(dueAtMs);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Topping tokens may be strings (e.g. "Pepperoni|extra") OR objects
 * (e.g. { name: "Pepperoni", portion: "extra", onTopOnly: true }).
 * Convert to a safe string so UI code never calls .split on non-strings.
 */
function toppingTokenToString(token) {
  if (typeof token === 'string') return token;
  if (token && typeof token === 'object') {
    const name = typeof token.name === 'string' ? token.name : '';
    const portion = typeof token.portion === 'string' ? token.portion : '';
    const onTopOnly = token.onTopOnly === true ? 'onTopOnly' : '';
    if (!name) return '';
    const extras = [portion, onTopOnly].filter(Boolean);
    return extras.length ? `${name}|${extras.join('|')}` : name;
  }
  return '';
}

function toppingTokenToPrettyText(token) {
  const s = toppingTokenToString(token);
  if (!s) return '';
  const [name, ...mods] = s.split('|').map(p => p.trim()).filter(Boolean);
  if (!name) return '';
  if (mods.length === 0) return name;
  return `${name} (${mods.join(', ')})`;
}

function formatToppingsList(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return '';
  return tokens.map(toppingTokenToPrettyText).filter(Boolean).join(', ');
}

/**
 * Generate collapsed item summary (single line)
 * e.g. "2x Large: Pep, Sausage | 1x Wings"
 */
function generateItemSummary(orderItems, maxLength = 60) {
  if (!orderItems || orderItems.length === 0) return 'No items';
  if (typeof orderItems === 'string') return orderItems;
  if (!Array.isArray(orderItems)) return 'No items';

  const parts = orderItems.map((item) => {
    const qty = item?.quantity || 1;
    let name = item?.name || 'Item';

    // Shorten pizza names to key details
    if (item?.pizzaDetails) {
      const size = item.pizzaDetails.size || '';
      const safeTokens = [
        ...((item.pizzaDetails.wholeToppings || []).map(toppingTokenToString).filter(Boolean)),
        ...((item.pizzaDetails.leftHalfToppings || []).map(t => {
          const s = toppingTokenToString(t);
          return s ? `L:${s}` : null;
        }).filter(Boolean)),
        ...((item.pizzaDetails.rightHalfToppings || []).map(t => {
          const s = toppingTokenToString(t);
          return s ? `R:${s}` : null;
        }).filter(Boolean)),
      ].slice(0, 3);

      const toppings = safeTokens.map(t => t.split('|')[0]).join(', ');
      name = `${size}: ${toppings || 'Cheese'}`;
    }

    return `${qty}x ${name}`;
  });

  let summary = parts.join(' | ');
  if (summary.length > maxLength) {
    summary = summary.slice(0, maxLength - 3) + '...';
  }
  return summary;
}

/**
 * Format detailed item view for expanded modal
 */
function formatDetailedItems(orderItems) {
  if (!orderItems || orderItems.length === 0) return [{ text: 'No items', type: 'item' }];
  if (typeof orderItems === 'string') return [{ text: orderItems, type: 'item' }];
  
  const lines = [];
  
  orderItems.forEach((item, idx) => {
    const qty = item.quantity || 1;
    let name = item.name || 'Item';
    
    lines.push({ text: `${qty}x ${name}`, type: 'item', key: `item-${idx}` });
    
    // If pizza, show detailed toppings
    if (item.pizzaDetails) {
      const pd = item.pizzaDetails;
      if (pd.wholeToppings?.length) {
        lines.push({ text: `  Whole: ${formatToppingsList(pd.wholeToppings)}`, type: 'detail', key: `whole-${idx}` });
      }
      if (pd.leftHalfToppings?.length) {
        lines.push({ text: `  Left: ${formatToppingsList(pd.leftHalfToppings)}`, type: 'detail', key: `left-${idx}` });
      }
      if (pd.rightHalfToppings?.length) {
        lines.push({ text: `  Right: ${formatToppingsList(pd.rightHalfToppings)}`, type: 'detail', key: `right-${idx}` });
      }
      if (pd.crust && pd.crust !== 'Hand Tossed') {
        lines.push({ text: `  Crust: ${pd.crust}`, type: 'detail', key: `crust-${idx}` });
      }
    }
    
    // Show modifiers
    if (item.modifiers?.length) {
      lines.push({ text: `  Mods: ${item.modifiers.join(', ')}`, type: 'modifier', key: `mod-${idx}` });
    }
    
    // Show item notes
    if (item.notes) {
      lines.push({ text: `  Note: ${item.notes}`, type: 'note', key: `note-${idx}` });
    }
  });
  
  return lines;
}

/**
 * Sort orders: urgent first (most overdue → soonest due), then by dueAt
 */
function sortOrders(orders) {
  return [...orders].sort((a, b) => {
    // Urgent orders first
    if (a.isUrgent && !b.isUrgent) return -1;
    if (!a.isUrgent && b.isUrgent) return 1;
    
    // Among urgent: most overdue first (smallest timeUntilDueMs first)
    if (a.isUrgent && b.isUrgent) {
      return a.timeUntilDueMs - b.timeUntilDueMs;
    }
    
    // Among non-urgent: earliest due first
    return a.dueAtMs - b.dueAtMs;
  });
}

/**
 * Get stored kitchen tokens from localStorage
 */
function getKitchenTokens(restaurantId) {
  try {
    const key = `${KITCHEN_TOKEN_KEY_PREFIX}${restaurantId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    
    const tokens = JSON.parse(stored);
    
    // Check if tokens are expired
    if (tokens.expiresAt && Date.now() > tokens.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    
    return tokens;
  } catch {
    return null;
  }
}

/**
 * Store kitchen tokens in localStorage
 */
function storeKitchenTokens(restaurantId, tokens) {
  try {
    const key = `${KITCHEN_TOKEN_KEY_PREFIX}${restaurantId}`;
    // Calculate expiry time (subtract 5 min buffer)
    const expiresAt = Date.now() + ((tokens.expiresIn || 28800) - 300) * 1000;
    
    localStorage.setItem(key, JSON.stringify({
      ...tokens,
      expiresAt,
    }));
  } catch (error) {
    console.error('Error storing kitchen tokens:', error);
  }
}

/**
 * Clear kitchen tokens from localStorage
 */
function clearKitchenTokens(restaurantId) {
  try {
    const key = `${KITCHEN_TOKEN_KEY_PREFIX}${restaurantId}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error clearing kitchen tokens:', error);
  }
}

export default function KitchenView() {
  const { restaurantId } = useParams();
  
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const tokens = getKitchenTokens(restaurantId);
    return !!tokens?.idToken;
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Get stored token for API calls
  const getKitchenIdToken = useCallback(() => {
    const tokens = getKitchenTokens(restaurantId);
    return tokens?.idToken || null;
  }, [restaurantId]);

  // localStorage keys for persistence
  const audioUnlockedKey = `savorSphere.kitchen.audioUnlocked.${restaurantId || 'default'}`;
  const soundPrefKey = `savorSphere.kitchen.soundPref.${restaurantId || 'default'}`;

  // Check if audio was successfully unlocked before (persists across sessions)
  const wasAudioUnlocked = () => {
    try {
      return window.localStorage.getItem(audioUnlockedKey) === 'true';
    } catch {
      return false;
    }
  };

  // User preference: sound on/off (default: ON)
  const getSoundPref = () => {
    try {
      const v = window.localStorage.getItem(soundPrefKey);
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  };

  // Raw orders from API
  const [rawOrders, setRawOrders] = useState([]);
  // Sorted/normalized orders (only re-sorted on key events)
  const [sortedOrders, setSortedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [wantsSound, setWantsSound] = useState(getSoundPref);
  const [showEnablePrompt, setShowEnablePrompt] = useState(() => {
    return !wasAudioUnlocked() && getSoundPref();
  });
  
  // Expanded order modal
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  
  // Long-press completion state
  const [holdingOrderId, setHoldingOrderId] = useState(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdStartTimeRef = useRef(null);
  const holdIntervalRef = useRef(null);
  
  // Confirm completion modal
  const [confirmOrderId, setConfirmOrderId] = useState(null);
  const [completingOrderId, setCompletingOrderId] = useState(null);
  const [completeError, setCompleteError] = useState(null);

  const audioRef = useRef(null);
  const pollingTimeoutRef = useRef(null);
  const lastOrderIdsRef = useRef(new Set());
  const lastNewOrderTimeRef = useRef(Date.now());
  const hasOrdersBaselineRef = useRef(false);
  // Track when we last reordered to prevent constant reshuffling
  const lastReorderTimeRef = useRef(0);

  // Save audio unlocked status to localStorage
  const markAudioUnlocked = useCallback((unlocked) => {
    try {
      window.localStorage.setItem(audioUnlockedKey, String(unlocked));
    } catch {
      // ignore localStorage errors
    }
  }, [audioUnlockedKey]);

  // Save sound preference to localStorage
  const saveSoundPref = useCallback((pref) => {
    try {
      window.localStorage.setItem(soundPrefKey, String(pref));
    } catch {
      // ignore localStorage errors
    }
  }, [soundPrefKey]);

  const enableAudio = useCallback(() => {
    if (!audioRef.current) return;
    // Unlock audio per browser autoplay rules
    audioRef.current.volume = 0.01;
    audioRef.current.play()
      .then(() => {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 1.0;
        setAudioEnabled(true);
        setShowEnablePrompt(false);
        markAudioUnlocked(true);
      })
      .catch(() => {
        setAudioEnabled(false);
        markAudioUnlocked(false);
      });
  }, [markAudioUnlocked]);

  // Handle PIN login
  const handlePinLogin = useCallback(async (e) => {
    e.preventDefault();
    
    if (!pinInput.trim()) {
      setPinError('Please enter your PIN');
      return;
    }
    
    setIsLoggingIn(true);
    setPinError(null);
    
    try {
      const result = await kitchenLogin(restaurantId, pinInput.trim());
      
      if (result.success && result.idToken) {
        storeKitchenTokens(restaurantId, {
          idToken: result.idToken,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
        });
        setIsAuthenticated(true);
        setPinInput('');
      } else {
        setPinError('Authentication failed. Please try again.');
      }
    } catch (error) {
      console.error('PIN login error:', error);
      setPinError(error.message || 'Invalid PIN or restaurant not found');
    } finally {
      setIsLoggingIn(false);
    }
  }, [restaurantId, pinInput]);

  // Force-unpair without confirmation (used when server rejects the session)
  const forceUnpair = useCallback((reason) => {
    clearKitchenTokens(restaurantId);
    setIsAuthenticated(false);
    setPinInput('');
    setPinError(reason || 'Session expired. Please enter the PIN again.');
  }, [restaurantId]);

  // Handle unpair/logout
  const handleUnpair = useCallback(() => {
    if (window.confirm('Unpair this tablet? You will need to enter the PIN again.')) {
      clearKitchenTokens(restaurantId);
      setIsAuthenticated(false);
      setPinInput('');
      setPinError(null);
    }
  }, [restaurantId]);

  // Auto-unlock audio on ANY user interaction (runs once per session)
  // This makes enabling sound invisible - the first natural tap unlocks audio
  useEffect(() => {
    if (!isAuthenticated) return;
    if (audioEnabled || !wantsSound) return;

    let unlocked = false;

    const unlockAudio = async () => {
      if (unlocked || !audioRef.current || audioEnabled) return;
      
      try {
        // Play silent audio to unlock
        audioRef.current.volume = 0.001;
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 1.0;
        unlocked = true;
        setAudioEnabled(true);
        setShowEnablePrompt(false);
        markAudioUnlocked(true);
        
        // Remove listeners once unlocked
        interactionEvents.forEach(event => {
          document.removeEventListener(event, unlockAudio, { capture: true });
        });
      } catch (e) {
        // Will try again on next interaction
      }
    };

    const interactionEvents = ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'];
    
    interactionEvents.forEach(event => {
      document.addEventListener(event, unlockAudio, { capture: true });
    });

    // Try immediately in case there's already been interaction
    unlockAudio();

    return () => {
      interactionEvents.forEach(event => {
        document.removeEventListener(event, unlockAudio, { capture: true });
      });
    };
  }, [isAuthenticated, audioEnabled, wantsSound, markAudioUnlocked]);

  // Toggle sound on/off via speaker icon
  const toggleSound = useCallback(() => {
    const newPref = !wantsSound;
    setWantsSound(newPref);
    saveSoundPref(newPref);

    if (newPref) {
      enableAudio();
    } else {
      setAudioEnabled(false);
      setShowEnablePrompt(false);
    }
  }, [wantsSound, saveSoundPref, enableAudio]);

  const playNotificationSound = useCallback(() => {
    if (!wantsSound) return;

    if (!audioEnabled) {
      setShowEnablePrompt(true);
      return;
    }

    if (!audioRef.current) return;

    audioRef.current.currentTime = 0;
    audioRef.current.volume = 1.0;

    audioRef.current.play()
      .then(() => {
        setTimeout(() => {
          if (!audioRef.current) return;
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }, 1000);
      })
      .catch(() => {
        setAudioEnabled(false);
        setShowEnablePrompt(true);
      });
  }, [audioEnabled, wantsSound]);

  // Re-sort orders (called on key events only)
  const triggerReorder = useCallback((orders, nowMs) => {
    const normalized = orders.map(o => normalizeOrder(o, nowMs));
    const sorted = sortOrders(normalized);
    setSortedOrders(sorted);
    lastReorderTimeRef.current = nowMs;
  }, []);

  // Auto-refresh via polling
  useEffect(() => {
    if (!isAuthenticated) return;

    let currentIntervalMs = 8000;

    const scheduleNext = () => {
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
      if (!isStoreOpenFromLocal(restaurantId)) return;
      pollingTimeoutRef.current = setTimeout(fetchOrders, currentIntervalMs);
    };

    const fetchOrders = async () => {
      if (!isStoreOpenFromLocal(restaurantId)) return;

      try {
        setIsReconnecting(false);
        const kitchenTokens = getKitchenTokens(restaurantId);
        // Use JWT-protected endpoint so PIN regeneration can invalidate sessions
        const response = await getOrders({}, restaurantId, { useAdminEndpoint: true, token: kitchenTokens?.idToken || null });
        const allOrders = Array.isArray(response?.orders) ? response.orders : [];

        const activeOrders = allOrders.filter(order => {
          const status = order?.status;
          const isActive =
            status === 'new' ||
            status === 'paid' ||
            status === 'accepted' ||
            status === 'preparing' ||
            status === 'ready';
          const isCallback = status === 'needs_callback';

          const matchesRestaurant =
            !restaurantId || order.restaurantId === restaurantId || order.restaurantId === undefined;

          return isActive && !isCallback && matchesRestaurant;
        });

        // New-order detection
        const currentIds = new Set(activeOrders.map(o => o.orderId).filter(Boolean));
        const newOrderIds = hasOrdersBaselineRef.current
          ? activeOrders
              .map(o => o.orderId)
              .filter(id => id && !lastOrderIdsRef.current.has(id))
          : [];

        const hasNewOrders = newOrderIds.length > 0;
        const hasRemovedOrders = [...lastOrderIdsRef.current].some(id => !currentIds.has(id));

        if (hasNewOrders) {
          currentIntervalMs = 5000;
          lastNewOrderTimeRef.current = Date.now();

          // Flash border (CSS)
          let flashCount = 0;
          const flash = () => {
            document.body.classList.add('flash-red');
            setTimeout(() => {
              document.body.classList.remove('flash-red');
              flashCount++;
              if (flashCount < 3) setTimeout(flash, 200);
            }, 200);
          };
          flash();

          playNotificationSound();
        } else if (Date.now() - lastNewOrderTimeRef.current > 60000) {
          currentIntervalMs = 15000;
        } else {
          currentIntervalMs = 8000;
        }

        lastOrderIdsRef.current = currentIds;
        hasOrdersBaselineRef.current = true;
        setRawOrders(activeOrders);
        
        // Only trigger reorder on: new orders arrive OR orders completed/removed
        // NOT just because time changed (prevents teleporting)
        if (hasNewOrders || hasRemovedOrders || sortedOrders.length === 0) {
          triggerReorder(activeOrders, Date.now());
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching orders:', err);

        // If the server rejects the token, force a re-pair
        if (err?.status === 401 || err?.status === 403) {
          forceUnpair('Kitchen session was invalidated. Please enter the new PIN.');
          return; // Stop scheduling further polls; effect will teardown because isAuthenticated becomes false
        }

        setIsReconnecting(true);
        setIsLoading(false);
        currentIntervalMs = 8000;
      }

      scheduleNext();
    };

    fetchOrders();
    return () => {
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    };
  }, [isAuthenticated, restaurantId, playNotificationSound, sortedOrders.length, triggerReorder]);

  // Update urgency status periodically (but don't reorder - just update the visual state)
  useEffect(() => {
    const interval = setInterval(() => {
      const nowMs = Date.now();
      setSortedOrders(prev => prev.map(o => {
        const timeUntilDueMs = o.dueAtMs - nowMs;
        const isUrgent = timeUntilDueMs <= URGENT_THRESHOLD_MS;
        const isOverdue = timeUntilDueMs < 0;
        return { ...o, timeUntilDueMs, isUrgent, isOverdue };
      }));
    }, 30000); // Every 30 seconds, update urgency state
    
    return () => clearInterval(interval);
  }, []);

  // Visible orders (first 6) and queue count
  const visibleOrders = useMemo(() => sortedOrders.slice(0, GRID_SIZE), [sortedOrders]);
  const queueCount = useMemo(() => Math.max(0, sortedOrders.length - GRID_SIZE), [sortedOrders]);

  // Get the expanded order object
  const expandedOrder = useMemo(() => {
    if (!expandedOrderId) return null;
    return sortedOrders.find(o => o.orderId === expandedOrderId);
  }, [expandedOrderId, sortedOrders]);

  // Handle long-press start
  const handleHoldStart = useCallback((orderId) => {
    if (completingOrderId) return; // Don't allow if already completing
    
    setHoldingOrderId(orderId);
    setHoldProgress(0);
    holdStartTimeRef.current = Date.now();
    
    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartTimeRef.current;
      const progress = Math.min(1, elapsed / HOLD_TO_COMPLETE_MS);
      setHoldProgress(progress);
      
      if (progress >= 1) {
        clearInterval(holdIntervalRef.current);
        holdIntervalRef.current = null;
        setHoldingOrderId(null);
        setHoldProgress(0);
        // Show confirm dialog
        setConfirmOrderId(orderId);
      }
    }, 50);
  }, [completingOrderId]);

  // Handle long-press cancel
  const handleHoldCancel = useCallback(() => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldingOrderId(null);
    setHoldProgress(0);
    holdStartTimeRef.current = null;
  }, []);

  // Confirm completion
  const handleConfirmComplete = useCallback(async () => {
    if (!confirmOrderId) return;
    
    setCompletingOrderId(confirmOrderId);
    setCompleteError(null);
    
    try {
      // Use JWT-protected endpoint so PIN regeneration can invalidate sessions
      await updateOrderStatus(confirmOrderId, 'completed', undefined, restaurantId, {
        useAdminEndpoint: true,
        token: getKitchenIdToken(),
      });
      // Remove from local state only on success
      setRawOrders(prev => prev.filter(o => o.orderId !== confirmOrderId));
      setSortedOrders(prev => prev.filter(o => o.orderId !== confirmOrderId));
      setConfirmOrderId(null);
      // Close expanded modal if this was the expanded order
      if (expandedOrderId === confirmOrderId) {
        setExpandedOrderId(null);
      }
    } catch (err) {
      console.error('Error completing order:', err);
      if (err?.status === 401 || err?.status === 403) {
        forceUnpair('Kitchen session was invalidated. Please enter the new PIN.');
        return;
      }
      setCompleteError('Failed to complete order. Tap to retry.');
    } finally {
      setCompletingOrderId(null);
    }
  }, [confirmOrderId, expandedOrderId, restaurantId, getKitchenIdToken, forceUnpair]);

  // Cancel confirm dialog
  const handleCancelConfirm = useCallback(() => {
    setConfirmOrderId(null);
    setCompleteError(null);
  }, []);

  // Handle accept order
  const handleAccept = async (orderId) => {
    try {
      const acceptedAt = new Date().toISOString();
      // Use JWT-protected endpoint so PIN regeneration can invalidate sessions
      await updateOrderStatus(orderId, 'preparing', acceptedAt, restaurantId, {
        useAdminEndpoint: true,
        token: getKitchenIdToken(),
      });
      const updateOrder = (o) => o.orderId === orderId ? { ...o, status: 'preparing', acceptedAt } : o;
      setRawOrders(prev => prev.map(updateOrder));
      setSortedOrders(prev => prev.map(updateOrder));
    } catch (err) {
      console.error('Error accepting order:', err);
      if (err?.status === 401 || err?.status === 403) {
        forceUnpair('Kitchen session was invalidated. Please enter the new PIN.');
        return;
      }
      alert('Failed to accept order. Please try again.');
    }
  };

  const handleCancel = async (orderId) => {
    const order = sortedOrders.find(o => o.orderId === orderId);
    const orderNumber = order?.orderNumber || (typeof orderId === 'string' ? orderId.slice(-6).toUpperCase() : '??????');
    const confirmed = window.confirm(`Cancel order #${orderNumber}?`);
    if (!confirmed) return;

    try {
      // Use JWT-protected endpoint so PIN regeneration can invalidate sessions
      await updateOrderStatus(orderId, 'cancelled', undefined, restaurantId, {
        useAdminEndpoint: true,
        token: getKitchenIdToken(),
      });
      setRawOrders(prev => prev.filter(o => o.orderId !== orderId));
      setSortedOrders(prev => prev.filter(o => o.orderId !== orderId));
      if (expandedOrderId === orderId) setExpandedOrderId(null);
      if (confirmOrderId === orderId) setConfirmOrderId(null);
    } catch (err) {
      console.error('Error cancelling order:', err);
      if (err?.status === 401 || err?.status === 403) {
        forceUnpair('Kitchen session was invalidated. Please enter the new PIN.');
        return;
      }
      alert('Failed to cancel order. Please try again.');
    }
  };

  // Tap on ticket to expand
  const handleTicketTap = useCallback((orderId, e) => {
    // Don't expand if tapping on action buttons
    if (e.target.closest('.ticket-actions')) return;
    
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      // Trigger reorder when closing expanded view
      triggerReorder(rawOrders, Date.now());
    } else {
      setExpandedOrderId(orderId);
    }
  }, [expandedOrderId, rawOrders, triggerReorder]);

  // Close expanded modal
  const handleCloseExpanded = useCallback(() => {
    setExpandedOrderId(null);
    // Trigger reorder when closing expanded view
    triggerReorder(rawOrders, Date.now());
  }, [rawOrders, triggerReorder]);

  // Get order type icon
  const getOrderTypeIcon = (orderType) => {
    switch (orderType) {
      case 'delivery': return '🚗';
      case 'pickup': return '🏃';
      case 'dine-in': return '🍽️';
      default: return '📦';
    }
  };

  // Get confirm order details for safe completion
  const confirmOrder = useMemo(() => {
    if (!confirmOrderId) return null;
    return sortedOrders.find(o => o.orderId === confirmOrderId);
  }, [confirmOrderId, sortedOrders]);

  // PIN Entry Screen (if not authenticated)
  if (!isAuthenticated) {
    return (
      <div className="kitchen-kiosk pin-entry-screen">
        <div className="pin-entry-container">
          <div className="pin-entry-header">
            <div className="pin-entry-icon">🔐</div>
            <h1>Kitchen Display</h1>
            <p className="pin-entry-subtitle">Enter your 6-digit PIN to pair this tablet</p>
          </div>
          
          <form onSubmit={handlePinLogin} className="pin-entry-form">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9\-]*"
              maxLength={7}
              placeholder="XXX-XXX"
              value={pinInput}
              onChange={(e) => {
                // Allow digits and optional dash
                let val = e.target.value.replace(/[^0-9\-]/g, '');
                // Auto-format with dash after 3 digits
                if (val.length === 3 && !val.includes('-') && pinInput.length < 3) {
                  val = val + '-';
                }
                setPinInput(val);
                setPinError(null);
              }}
              className="pin-entry-input"
              autoFocus
              disabled={isLoggingIn}
            />
            
            {pinError && (
              <div className="pin-entry-error">
                {pinError}
              </div>
            )}
            
            <button 
              type="submit" 
              className="pin-entry-button"
              disabled={isLoggingIn || !pinInput.trim()}
            >
              {isLoggingIn ? 'Pairing...' : 'Pair Tablet'}
            </button>
          </form>
          
          <div className="pin-entry-help">
            <p>Get your PIN from the admin dashboard</p>
            <p className="pin-entry-help-small">Billing & Account → Kitchen Tablet PIN</p>
          </div>
        </div>
        
        <div className="tablet-id">
          Restaurant: {restaurantId || 'unknown'}
        </div>
      </div>
    );
  }

  // Check if banner is showing for layout adjustment
  const bannerVisible = showEnablePrompt && wantsSound && !audioEnabled;

  return (
    <div className={`kitchen-kiosk ${bannerVisible ? 'has-audio-banner' : ''}`}>
      <audio ref={audioRef} src={NOTIFICATION_SOUND_URL} preload="auto" />

      {/* Enable Sound Banner - Non-blocking, auto-dismisses on any interaction */}
      {showEnablePrompt && wantsSound && !audioEnabled && (
        <div className="audio-unlock-banner" onClick={enableAudio}>
          <span className="audio-unlock-icon">🔔</span>
          <span className="audio-unlock-text">Tap anywhere to enable order alerts</span>
        </div>
      )}

      {/* Reconnecting Overlay */}
      {isReconnecting && (
        <div className="reconnecting-overlay">
          <div className="reconnecting-content">
            <div className="spinner"></div>
            <p>Reconnecting…</p>
          </div>
        </div>
      )}

      {/* Confirm Complete Modal */}
      {confirmOrderId && confirmOrder && (
        <div className="confirm-overlay" onClick={(e) => e.target === e.currentTarget && handleCancelConfirm()}>
          <div className="confirm-modal">
            <div className="confirm-header">
              <span className="confirm-icon">✓</span>
              <h2>Mark Order Complete?</h2>
            </div>
            <div className="confirm-order-info">
              <div className="confirm-order-number">#{confirmOrder.orderNumber}</div>
              <div className="confirm-order-type">
                {getOrderTypeIcon(confirmOrder.orderType)} {confirmOrder.orderType.toUpperCase()}
              </div>
              <div className="confirm-due-time">Due: {formatDueTime(confirmOrder.dueAtMs)}</div>
            </div>
            {completeError && (
              <div className="confirm-error" onClick={handleConfirmComplete}>
                {completeError}
              </div>
            )}
            <div className="confirm-actions">
              <button 
                className="confirm-btn confirm-btn-cancel" 
                onClick={handleCancelConfirm}
                disabled={completingOrderId === confirmOrderId}
              >
                CANCEL
              </button>
              <button 
                className="confirm-btn confirm-btn-confirm" 
                onClick={handleConfirmComplete}
                disabled={completingOrderId === confirmOrderId}
              >
                {completingOrderId === confirmOrderId ? 'COMPLETING...' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Order Modal */}
      {expandedOrder && (
        <div className="expanded-overlay" onClick={(e) => e.target === e.currentTarget && handleCloseExpanded()}>
          <div className={`expanded-modal ${expandedOrder.isUrgent ? 'urgent' : ''}`}>
            <div className="expanded-header">
              <div className="expanded-order-info">
                <span className="expanded-order-number">#{expandedOrder.orderNumber}</span>
                <span className="expanded-order-type">
                  {getOrderTypeIcon(expandedOrder.orderType)} {expandedOrder.orderType.toUpperCase()}
                </span>
                {expandedOrder.etaDefault && (
                  <span className="eta-default-badge">ETA default</span>
                )}
              </div>
              <button className="expanded-close" onClick={handleCloseExpanded}>×</button>
            </div>
            
            <div className="expanded-due-time">
              <span className={`due-label ${expandedOrder.isOverdue ? 'overdue' : expandedOrder.isUrgent ? 'urgent' : ''}`}>
                {expandedOrder.isOverdue ? 'OVERDUE' : 'Due'}: {formatDueTime(expandedOrder.dueAtMs)}
              </span>
            </div>
            
            <div className="expanded-items">
              {formatDetailedItems(expandedOrder.orderItems).map((line, idx) => (
                <div key={line.key || idx} className={`expanded-item-line ${line.type}`}>
                  {line.text}
                </div>
              ))}
            </div>
            
            {/* Customer instructions */}
            {expandedOrder.instructions && (
              <div className="expanded-instructions">
                <strong>Instructions:</strong> {expandedOrder.instructions}
              </div>
            )}
            
            {/* Delivery address */}
            {expandedOrder.orderType === 'delivery' && expandedOrder.address && (
              <div className="expanded-address">
                <strong>Deliver to:</strong> {expandedOrder.address}
              </div>
            )}
            
            <div className="expanded-actions">
              {(expandedOrder.status === 'new' || expandedOrder.status === 'paid') ? (
                <>
                  <button 
                    className="action-button accept-button"
                    onClick={() => handleAccept(expandedOrder.orderId)}
                  >
                    ACCEPT
                  </button>
                  <button 
                    className="action-button cancel-button"
                    onClick={() => handleCancel(expandedOrder.orderId)}
                  >
                    CANCEL
                  </button>
                </>
              ) : (
                <div 
                  className={`hold-to-complete ${holdingOrderId === expandedOrder.orderId ? 'holding' : ''}`}
                  onPointerDown={() => handleHoldStart(expandedOrder.orderId)}
                  onPointerUp={handleHoldCancel}
                  onPointerLeave={handleHoldCancel}
                  onPointerCancel={handleHoldCancel}
                >
                  <div 
                    className="hold-progress" 
                    style={{ width: holdingOrderId === expandedOrder.orderId ? `${holdProgress * 100}%` : '0%' }}
                  />
                  <span className="hold-text">HOLD TO COMPLETE</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="kitchen-header">
        <div className="kitchen-title">Kitchen Display</div>
        {queueCount > 0 && (
          <div className="queue-badge">
            Queue: {queueCount}
          </div>
        )}
        <div
          className={`audio-status ${(wantsSound && audioEnabled) ? 'enabled' : 'disabled'}`}
          onClick={toggleSound}
          title={
            (wantsSound && audioEnabled) 
              ? 'Sound on - Click to turn off' 
              : wantsSound 
                ? 'Sound on but blocked - Click to enable' 
                : 'Sound off - Click to turn on'
          }
        >
          {(wantsSound && audioEnabled) ? '🔊' : '🔇'}
        </div>
      </div>

      {/* Main Content */}
      <div className="orders-container">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading orders...</p>
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="no-orders">
            <div className="no-orders-icon">🍕</div>
            <div className="no-orders-text">No active orders</div>
            <div className="no-orders-subtext">New orders will appear here automatically</div>
          </div>
        ) : (
          <div className="orders-grid-fixed">
            {visibleOrders.map((order) => {
              const isAccepted = order.status === 'accepted' || order.status === 'preparing' || order.status === 'ready';
              const isHolding = holdingOrderId === order.orderId;
              
              return (
                <div
                  key={order.orderId}
                  className={`ticket-card ${isAccepted ? 'accepted' : ''} ${order.isUrgent ? 'urgent' : ''} ${order.isOverdue ? 'overdue' : ''}`}
                  onClick={(e) => handleTicketTap(order.orderId, e)}
                >
                  {/* Ticket Header */}
                  <div className="ticket-header">
                    <span className="ticket-order-number">#{order.orderNumber}</span>
                    <span className="ticket-type-icon" title={order.orderType}>
                      {getOrderTypeIcon(order.orderType)}
                    </span>
                    {order.etaDefault && <span className="eta-default-dot" title="ETA default">•</span>}
                  </div>
                  
                  {/* Due Time */}
                  <div className={`ticket-due-time ${order.isOverdue ? 'overdue' : order.isUrgent ? 'urgent' : ''}`}>
                    {order.isOverdue ? 'LATE: ' : ''}{formatDueTime(order.dueAtMs)}
                  </div>
                  
                  {/* Item Summary */}
                  <div className="ticket-summary">
                    {generateItemSummary(order.orderItems)}
                  </div>
                  
                  {/* Ticket Actions */}
                  <div className="ticket-actions">
                    {(order.status === 'new' || order.status === 'paid') ? (
                      <>
                        <button 
                          className="ticket-btn ticket-btn-accept"
                          onClick={(e) => { e.stopPropagation(); handleAccept(order.orderId); }}
                        >
                          ACCEPT
                        </button>
                        <button 
                          className="ticket-btn ticket-btn-cancel"
                          onClick={(e) => { e.stopPropagation(); handleCancel(order.orderId); }}
                        >
                          CANCEL
                        </button>
                      </>
                    ) : (
                      <div 
                        className={`ticket-hold-btn ${isHolding ? 'holding' : ''}`}
                        onPointerDown={(e) => { e.stopPropagation(); handleHoldStart(order.orderId); }}
                        onPointerUp={handleHoldCancel}
                        onPointerLeave={handleHoldCancel}
                        onPointerCancel={handleHoldCancel}
                      >
                        <div 
                          className="ticket-hold-progress" 
                          style={{ width: isHolding ? `${holdProgress * 100}%` : '0%' }}
                        />
                        <span className="ticket-hold-text">DONE</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {/* Empty slots to maintain 2x3 grid */}
            {Array.from({ length: GRID_SIZE - visibleOrders.length }).map((_, i) => (
              <div key={`empty-${i}`} className="ticket-card empty" />
            ))}
          </div>
        )}
      </div>

      <div className="tablet-footer">
        <div className="tablet-id">
          Tablet ID: {restaurantId || 'unknown'}
        </div>
        <button 
          className="unpair-button"
          onClick={handleUnpair}
          title="Unpair this tablet"
        >
          Unpair
        </button>
      </div>
    </div>
  );
}
