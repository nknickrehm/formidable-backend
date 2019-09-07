module.exports = (form) => {
  const { _id, type, tag, lastEdit, fields } = form;
  const summary = { _id, type, tag, lastEdit };
  switch (type) {
    case 'businessTrip': {
      const begin = fields.find(field => field.name === 'begin');
      const end = fields.find(field => field.name === 'end');
      const destinations = fields.find(field => field.name === 'destinations');
      summary.begin = begin.value || '';
      summary.end = end.value || '';
      summary.name = destinations.value || '-';
      break;
    }
    case 'vacation': {
      const begin = fields.find(field => field.name === 'begin');
      const end = fields.find(field => field.name === 'end');
      summary.begin = begin.value;
      summary.end = end.value;
      summary.name = '';
      break;
    }
    default: break;
  }

  const isComplete = !fields.find(field => !field.isValid);
  summary.isComplete = isComplete;

  return summary;
}