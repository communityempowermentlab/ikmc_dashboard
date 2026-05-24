import { configureStore } from '@reduxjs/toolkit';
import filterReducer    from './slices/filterSlice';
import admissionReducer from './slices/admissionSlice';

export const store = configureStore({
  reducer: {
    filters:    filterReducer,
    admissions: admissionReducer,
  },
});
