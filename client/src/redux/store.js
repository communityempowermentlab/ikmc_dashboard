import { configureStore } from '@reduxjs/toolkit';
import filterReducer    from './slices/filterSlice';
import admissionReducer from './slices/admissionSlice';
import analyticsReducer from './slices/analyticsSlice';

export const store = configureStore({
  reducer: {
    filters:    filterReducer,
    admissions: admissionReducer,
    analytics:  analyticsReducer,
  },
});
