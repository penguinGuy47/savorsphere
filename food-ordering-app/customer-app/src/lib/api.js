import axios from 'axios';
import { getCachedMenu, setCachedMenu } from './menuCache';

// 1. Next.js Environment Variable Update:
// Next.js requires PUBLIC environment variables to be prefixed with NEXT_PUBLIC_
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://j0xei88zi7.execute-api.us-east-2.amazonaws.com/prod';

// 2. Convert to async/await for Server Component compatibility
export const getMenu = async () => {
    const apiURL = `${API_BASE}/menu`;
    
    // Check cache first (client-side only)
    if (typeof window !== 'undefined') {
        const cached = getCachedMenu();
        if (cached) {
            console.log('✅ Using cached menu data');
            return cached;
        }
    }
    
    console.log('Calling API:', apiURL);
    
    try {
        // Next.js's native fetch is often preferred, but axios works.
        // If you were using native fetch, Next.js automatically memoizes (caches) it.
        const res = await axios.get(apiURL);
        const menuData = res.data;
        
        // Cache the response (client-side only)
        if (typeof window !== 'undefined') {
            setCachedMenu(menuData);
        }
        
        console.log('✅ Response data:', menuData);
        return menuData;

    } catch (error) {
        console.error('❌ Axios error:', error);
        // Important: Re-throw the error so the calling function can handle the fallback (like mock data).
        throw error; 
    }
};

// Update other functions to use async/await as well for consistency
export const getSettings = async () => {
    const res = await axios.get(`${API_BASE}/settings`);
    return res.data;
};

export const createPaymentIntent = async (data) => {
    const res = await axios.post(`${API_BASE}/payment/intent`, data);
    return res.data;
};

export const createOrder = async (data) => {
    const res = await axios.post(`${API_BASE}/orders`, data);
    return res.data;
};

export const getOrder = async (id) => {
    const res = await axios.get(`${API_BASE}/order/${id}`);
    return res.data;
};

export const sendOTP = async (phone) => {
    const res = await axios.post(`${API_BASE}/otp/send`, { phone });
    return res.data;
};

export const verifyOTP = async (phone, otp) => {
    const res = await axios.post(`${API_BASE}/otp/verify`, { phone, otp });
    return res.data;
};