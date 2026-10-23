const { backendFunctions } = require('../api/backend');

function removeAccents(str) {
  if (!str) return '';
  return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function debugAngelo() {
  const auth = await backendFunctions.authenticateUser('Angelo', 'vtnc');
  const loggedUser = auth.user;
  const appData = await backendFunctions.getAppData(loggedUser);

  console.log('LoggedUser:', loggedUser);
  console.log('appData.visitas total count:', appData.visitas.length);

  // Check all visitas of Angelo
  const allAngelo = appData.visitas.filter(v => removeAccents(v.representante).toLowerCase() === 'angelo');
  console.log('All Angelo visits count in appData:', allAngelo.length);
  console.log('Angelo visits with dates:', allAngelo.map(v => v.data).slice(0, 10));

  // Date filter logic from renderVisitaMedicaTab
  const d = new Date();
  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const startVal = y + "-" + m + "-01";
  const endVal = y + "-" + m + "-" + ("0" + new Date(y, d.getMonth() + 1, 0).getDate()).slice(-2);
  console.log('Date filters configured in UI:', startVal, 'to', endVal);

  const dInicio = new Date(startVal + "T00:00:00");
  const dFim = new Date(endVal + "T23:59:59");

  const repVal = loggedUser.nome; // 'Angelo'
  const assuntoVal = 'Todos';
  const searchVal = '';

  const filtered = (appData.visitas || []).filter(function(v) {
    if (repVal !== 'Todos' && removeAccents(v.representante).toLowerCase() !== removeAccents(repVal).toLowerCase()) {
      return false;
    }
    if (assuntoVal !== 'Todos' && v.assunto !== assuntoVal) {
      return false;
    }
    if (dInicio || dFim) {
      if (!v.data || typeof v.data !== 'string') return false;
      const dateV = new Date(v.data.split('T')[0] + "T12:00:00");
      if (dInicio && dateV < dInicio) return false;
      if (dFim && dateV > dFim) return false;
    }
    return true;
  });

  console.log('Filtered visits count for Angelo with current month filter:', filtered.length);
  filtered.forEach(v => console.log(' ->', v.id, v.data, v.hora, v.medicoNome, v.representante));
}

debugAngelo().catch(console.error);
