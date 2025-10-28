import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'https://j0xei88zi7.execute-api.us-east-2.amazonaws.com/prod'; // Set in .env

export const getMenu = () => {
    console.log('Calling API:', `${API_BASE}/menu`);
    return axios.get(`${API_BASE}/menu`)
        .then((res) => {
            console.log('Full axios response:', res);
            console.log('Response data:', res.data);
            console.log('Response data type:', typeof res.data);
            return res.data;
        })
        .catch((error) => {
            console.error('Axios error:', error);
            throw error;
        });
};

export const getSettings = () => axios.get(`${API_BASE}/settings`).then((res) => res.data);

export const createPaymentIntent = (data) => axios.post(`${API_BASE}/payment/intent`, data).then((res) => res.data);

export const createOrder = (data) => axios.post(`${API_BASE}/orders`, data).then((res) => res.data);

export const getOrder = (id) => axios.get(`${API_BASE}/order/${id}`).then((res) => res.data);