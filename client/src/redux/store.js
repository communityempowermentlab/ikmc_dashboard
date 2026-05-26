import { configureStore } from '@reduxjs/toolkit';
import filterReducer    from './slices/filterSlice';
import admissionReducer from './slices/admissionSlice';
import nurseReducer     from './slices/nurseSlice';
import districtReducer  from './slices/districtSlice';

export const store = configureStore({
  reducer: {
    filters:    filterReducer,
    admissions: admissionReducer,
    nurses:     nurseReducer,
    district:   districtReducer,
  },
});
