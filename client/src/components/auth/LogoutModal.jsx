import React from 'react';
import './LogoutModal.css';

const LogoutModal = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="logout-modal-overlay">
      <div className="logout-modal-card">
        <h3>Confirm Logout</h3>
        <p>Are you sure you want to logout of the iKMC Dashboard?</p>
        <div className="logout-modal-actions">
          <button className="logout-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="logout-btn-confirm" onClick={onConfirm}>Logout</button>
        </div>
      </div>
    </div>
  );
};

export default LogoutModal;
