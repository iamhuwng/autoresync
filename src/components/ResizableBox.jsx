import React, { useState, useEffect, useRef } from 'react';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';

const CustomResizableBox = ({ children }) => {
  const [width, setWidth] = useState(300);
  const [height, setHeight] = useState(200);

  const onResize = (event, { size }) => {
    setWidth(size.width);
    setHeight(size.height);
  };

  return (
    <ResizableBox
      height={height}
      width={width}
      onResize={onResize}
      minConstraints={[200, 100]}
      maxConstraints={[800, 600]}
      resizeHandles={['ne']}
    >
      <div
        style={{ width: '100%', height: '100%', overflow: 'auto', padding: '10px' }}
      >
        {children}
      </div>
    </ResizableBox>
  );
};

export default CustomResizableBox;
