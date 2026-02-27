import React from 'react';

const Avatar = ({ name }) => {
  const colors = ['#FFC107', '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FF9800', '#FF5722', '#795548', '#9E9E9E', '#607D8B'];

  const getInitials = (name) => {
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  const getColor = (name) => {
    const charCodeSum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[charCodeSum % colors.length];
  };

  const style = {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: getColor(name),
    color: 'white',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 'bold',
    fontSize: '1.2rem',
  };

  return (
    <div style={style}>
      {getInitials(name)}
    </div>
  );
};

export default Avatar;
