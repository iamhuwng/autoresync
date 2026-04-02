import React from 'react';
import PropTypes from 'prop-types';
import PassageRenderer from '../skills/reading/components/PassageRenderer';

const PassageRendererV2 = (props) => <PassageRenderer {...props} />;

PassageRendererV2.propTypes = {
  passage: PropTypes.shape({
    type: PropTypes.oneOf(['text', 'image', 'both']).isRequired,
    content: PropTypes.string,
    imageUrl: PropTypes.string,
    caption: PropTypes.string,
    title: PropTypes.string,
    id: PropTypes.string,
  }),
  fontSize: PropTypes.number,
  onFontSizeChange: PropTypes.func,
  lineSpacing: PropTypes.number,
  highlighterActive: PropTypes.bool,
  highlightColor: PropTypes.string,
  clearHighlightsTrigger: PropTypes.number,
  showSectionLabels: PropTypes.bool,
};

export default PassageRendererV2;
