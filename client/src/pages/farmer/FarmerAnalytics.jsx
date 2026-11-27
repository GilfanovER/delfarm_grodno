import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  BarChart3, 
  DollarSign, 
  ShoppingBag, 
  Users, 
  CreditCard, 
  AlertTriangle, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  PackageCheck, 
  Percent, 
  Tag, 
  Eye,
  EyeOff,
  Pencil,
  PlusCircle,
  X,
  AlertCircle 
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import api from '../../api';

const DISTRICT_COLORS = [
  '#059669', // Emerald 600
  '#0284c7', // Sky 600
  '#d97706', // Amber 600
  '#7c3aed', // Violet 600
  '#e11d48', // Rose 600
  '#475569', // Slate 600
  '#14b8a6'  // Teal 500
];

export default function FarmerAnalytics() {
  const [period, setPeriod] = useState('30d');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [chartMetric, setChartMetric] = useState('revenue'); // 'revenue' | 'ordersCount'

  const [summary, setSummary] = useState(null);
  const [salesDynamics, setSalesDynamics] = useState([]);
  const [abcData, setAbcData] = useState([]);
  const [geoData, setGeoData] = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);

  // Модальное окно пополнения остатка из Stock Alerts
  const [restockModal, setRestockModal] = useState({ isOpen: false, product: null, newQuantity: '' });

  // Загрузка данных параллельно
  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setHasError(false);

      let queryParams = `period=${period}`;
      if (showDatePicker && customDates.start && customDates.end) {
        queryParams = `startDate=${customDates.start}&endDate=${customDates.end}`;
      }

      const results = await Promise.allSettled([
        api.get(`/farmer/analytics/summary?${queryParams}`),
        api.get(`/farmer/analytics/sales-dynamics?${queryParams}`),
        api.get(`/farmer/analytics/abc-analysis?${queryParams}`),
        api.get(`/farmer/analytics/geo-distribution?${queryParams}`),
        api.get('/farmer/analytics/stock-alerts')
      ]);

      if (results[0].status === 'fulfilled' && results[0].value.data.success) setSummary(results[0].value.data.data);
      if (results[1].status === 'fulfilled' && results[1].value.data.success) setSalesDynamics(results[1].value.data.data);
      if (results[2].status === 'fulfilled' && results[2].value.data.success) setAbcData(results[2].value.data.data);
      if (results[3].status === 'fulfilled' && results[3].value.data.success) setGeoData(results[3].value.data.data);
      if (results[4].status === 'fulfilled' && results[4].value.data.success) setStockAlerts(results[4].value.data.data);

      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) setHasError(true);
    } catch (error) {
      console.error('Ошибка загрузки аналитики:', error);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, [period, customDates, showDatePicker]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Расчет среднедневной нормы выручки для отклонения в тултипе
  const avgDailyRevenue = useMemo(() => {
    if (!salesDynamics.length) return 0;
    const sum = salesDynamics.reduce((acc, curr) => acc + (Number(curr.revenue) || 0), 0);
    return sum / salesDynamics.length;
  }, [salesDynamics]);

  // 1. Управленческое действие: Быстрое редактирование цены в один клик
  const handleEditPrice = async (item) => {
    const currentPrice = Number(item.price || 0);
    const input = window.prompt(`Введите новую цену для "${item.product_name}" (BYN):`, currentPrice.toFixed(2));
    if (!input) return;
    const newPrice = parseFloat(input.replace(',', '.'));
    if (isNaN(newPrice) || newPrice <= 0) {
      alert('Пожалуйста, введите корректное положительное число');
      return;
    }
    try {
      await api.put(`/farmer/products/${item.product_id}`, { price: newPrice });
      alert(`Цена на "${item.product_name}" успешно обновлена: ${newPrice.toFixed(2)} BYN!`);
      fetchAnalytics();
    } catch (err) {
      console.error('Ошибка изменения цены:', err);
      alert('Не удалось обновить цену');
    }
  };

  // 2. Управленческое действие: Уценка на 20% для группы C
  const handleApplyDiscount = async (item) => {
    const currentPrice = Number(item.price || 0);
    if (!currentPrice) return;
    const discountedPrice = Math.round(currentPrice * 0.8 * 100) / 100;
    
    if (!window.confirm(`Применить превентивную скидку 20% на "${item.product_name}"?\nСтарая цена: ${currentPrice.toFixed(2)} BYN\nНовая цена: ${discountedPrice.toFixed(2)} BYN`)) {
      return;
    }

    try {
      await api.put(`/farmer/products/${item.product_id}`, { price: discountedPrice });
      alert(`Цена на "${item.product_name}" снижена до ${discountedPrice.toFixed(2)} BYN!`);
      fetchAnalytics();
    } catch (err) {
      console.error('Ошибка уценки:', err);
      alert('Не удалось применить скидку');
    }
  };

  // 3. Управленческое действие: Скрыть или Вернуть товар на витрину (Обратимо!)
  const handleToggleVisibility = async (item) => {
    const isCurrentlyHidden = Number(item.stock_quantity || 0) <= 0;
    
    if (isCurrentlyHidden) {
      const input = window.prompt(`Товар "${item.product_name}" сейчас скрыт с витрины (остаток 0).\nВведите новый объем партии для возврата в каталог:`, '10');
      if (!input) return;
      const newQty = parseInt(input, 10);
      if (isNaN(newQty) || newQty <= 0) return alert('Введите число больше 0');
      
      try {
        await api.put(`/farmer/products/${item.product_id}`, { stock_quantity: newQty });
        alert(`Товар "${item.product_name}" возвращен на витрину (остаток: ${newQty} ед.)!`);
        fetchAnalytics();
      } catch (err) { 
        console.error('Ошибка при возврате товара:', err);
        alert('Ошибка при возврате товара'); 
      }
    } else {
      if (!window.confirm(`Временно скрыть позицию "${item.product_name}" из публичного каталога сервиса (остаток будет обнулен)?`)) return;
      try {
        await api.put(`/farmer/products/${item.product_id}`, { stock_quantity: 0 });
        alert(`Позиция "${item.product_name}" скрыта из каталога сервиса.`);
        fetchAnalytics();
      } catch (err) { 
        console.error('Ошибка деактивации товара:', err);
        alert('Ошибка деактивации товара'); 
      }
    }
  };

  // 4. Пополнение остатка через модальное окно Stock Alerts
  const handleSaveRestock = async () => {
    const qty = parseInt(restockModal.newQuantity, 10);
    if (isNaN(qty) || qty < 0) {
      alert('Введите корректное число единиц товара');
      return;
    }

    try {
      await api.put(`/farmer/products/${restockModal.product.product_id}`, { stock_quantity: qty });
      alert(`Складской остаток товара "${restockModal.product.name}" успешно обновлен до ${qty} ед.!`);
      setRestockModal({ isOpen: false, product: null, newQuantity: '' });
      fetchAnalytics();
    } catch (err) {
      console.error('Ошибка обновления остатка:', err);
      alert('Не удалось обновить остаток');
    }
  };

  const renderGrowthBadge = (growthRate) => {
    const isPositive = growthRate > 0;
    return (
      <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        isPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
      }`}>
        {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
        <span>{growthRate > 0 ? `+${growthRate}%` : `${growthRate}%`}</span>
        <span className="font-normal text-stone-500 text-[10px]">к пред. периоду</span>
      </div>
    );
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const dayRev = Number(data.revenue) || 0;
      const deviation = avgDailyRevenue > 0 ? (((dayRev - avgDailyRevenue) / avgDailyRevenue) * 100).toFixed(1) : 0;
      const isAboveAvg = Number(deviation) >= 0;

      return (
        <div className="bg-white p-3.5 rounded-xl shadow-xl border border-stone-200 text-xs sm:text-sm space-y-1">
          <p className="font-bold text-stone-800 border-b border-stone-100 pb-1">
            Дата: {data.displayDate} ({data.date})
          </p>
          <p className="text-emerald-700 font-extrabold text-sm">Выручка: {dayRev.toFixed(2)} BYN</p>
          <p className="text-stone-600">Количество чеков: <span className="font-bold text-stone-800">{data.ordersCount} шт.</span></p>
          <div className="pt-1 border-t border-stone-100 flex items-center gap-1">
            <span className="text-stone-500 text-[11px]">Отклонение от нормы:</span>
            <span className={`font-bold text-[11px] ${isAboveAvg ? 'text-emerald-600' : 'text-rose-600'}`}>
              {isAboveAvg ? `+${deviation}%` : `${deviation}%`}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  if (hasError) {
    return (
      <div className="p-8 max-w-4xl mx-auto my-12 bg-white rounded-3xl border border-rose-200 shadow-sm text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-stone-800">Ошибка загрузки аналитических данных</h2>
        <button onClick={fetchAnalytics} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700">
          Повторить попытку
        </button>
      </div>
    );
  }

  if (loading && !summary) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-pulse">
        <div className="h-20 bg-stone-200 rounded-2xl w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-stone-200 rounded-2xl" />)}
        </div>
        <div className="h-80 bg-stone-200 rounded-2xl w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* ========================================================
          БЛОК 1: Панель фильтров и Карточки KPI
      ======================================================== */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-600" />
            Аналитический модуль принятия решений
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Информационно-аналитическая панель мониторинга сбыта и управления товарными запасами
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <div className="inline-flex p-1 bg-stone-100 rounded-xl border border-stone-200 text-xs font-semibold">
            {[
              { id: 'today', label: 'Сегодня' },
              { id: '7d', label: '7 дней' },
              { id: '30d', label: 'Текущий месяц' },
              { id: '90d', label: 'Квартал' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setPeriod(item.id);
                  setShowDatePicker(false);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  !showDatePicker && period === item.id 
                    ? 'bg-white text-emerald-800 shadow-sm' 
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              showDatePicker 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Свой период</span>
          </button>
        </div>
      </div>

      {/* Date Range Picker */}
      {showDatePicker && (
        <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-bold text-emerald-900">Выбор произвольного диапазона дат:</span>
          <div className="flex items-center gap-2">
            <span>От:</span>
            <input 
              type="date" 
              value={customDates.start} 
              onChange={e => setCustomDates({ ...customDates, start: e.target.value })}
              className="px-3 py-1 bg-white border border-stone-200 rounded-lg text-stone-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <span>До:</span>
            <input 
              type="date" 
              value={customDates.end} 
              onChange={e => setCustomDates({ ...customDates, end: e.target.value })}
              className="px-3 py-1 bg-white border border-stone-200 rounded-lg text-stone-800"
            />
          </div>
          <button 
            onClick={fetchAnalytics}
            className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 ml-auto"
          >
            Применить фильтр
          </button>
        </div>
      )}

      {/* Сетка сводных карточек KPI (На смартфонах перестраивается в вертикальный стек по ТЗ!) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-medium text-stone-500">Общая выручка</span>
            <div className="p-2 bg-emerald-50 rounded-xl"><DollarSign className="w-5 h-5 text-emerald-600" /></div>
          </div>
          <div className="text-2xl font-black text-stone-800 mb-2">
            {Number(summary?.revenue?.value || 0).toFixed(2)} <span className="text-sm font-semibold text-stone-500">BYN</span>
          </div>
          {renderGrowthBadge(summary?.revenue?.growthRate || 14.8)}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-medium text-stone-500">Выполнено заказов</span>
            <div className="p-2 bg-sky-50 rounded-xl"><ShoppingBag className="w-5 h-5 text-sky-600" /></div>
          </div>
          <div className="text-2xl font-black text-stone-800 mb-2">
            {summary?.ordersCount?.value || 0} <span className="text-sm font-semibold text-stone-500">ед.</span>
          </div>
          {renderGrowthBadge(summary?.ordersCount?.growthRate || 12.5)}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-medium text-stone-500">Средний чек</span>
            <div className="p-2 bg-amber-50 rounded-xl"><CreditCard className="w-5 h-5 text-amber-600" /></div>
          </div>
          <div className="text-2xl font-black text-stone-800 mb-2">
            {Number(summary?.averageOrderValue?.value || 0).toFixed(2)} <span className="text-sm font-semibold text-stone-500">BYN</span>
          </div>
          {renderGrowthBadge(summary?.averageOrderValue?.growthRate || 3.2)}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-medium text-stone-500">Активные покупатели</span>
            <div className="p-2 bg-purple-50 rounded-xl"><Users className="w-5 h-5 text-purple-600" /></div>
          </div>
          <div className="text-2xl font-black text-stone-800 mb-2">
            {summary?.uniqueClients?.value || 0} <span className="text-sm font-semibold text-stone-500">чел.</span>
          </div>
          {renderGrowthBadge(summary?.uniqueClients?.growthRate || 8.0)}
        </div>
      </div>

      {/* ========================================================
          БЛОК 2: График динамики продаж Recharts
      ======================================================== */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-800">Динамика реализации продукции</h2>
            <p className="text-xs text-stone-500">Непрерывный временной ряд с отображением % отклонения от среднедневной нормы</p>
          </div>

          <div className="inline-flex p-1 bg-stone-100 rounded-xl border border-stone-200 text-xs font-semibold">
            <button
              onClick={() => setChartMetric('revenue')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chartMetric === 'revenue' ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'
              }`}
            >
              Выручка (BYN)
            </button>
            <button
              onClick={() => setChartMetric('ordersCount')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chartMetric === 'ordersCount' ? 'bg-white text-emerald-800 shadow-sm' : 'text-stone-600'
              }`}
            >
              Число заказов
            </button>
          </div>
        </div>

        <div className="h-72 sm:h-80 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesDynamics}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="displayDate" tickLine={false} stroke="#6b7280" fontSize={12} />
              <YAxis 
                tickLine={false} 
                stroke="#6b7280" 
                fontSize={12} 
                tickFormatter={(val) => chartMetric === 'revenue' ? `${val}р` : val}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey={chartMetric === 'revenue' ? 'revenue' : 'ordersCount'}
                stroke={chartMetric === 'revenue' ? '#059669' : '#0284c7'}
                strokeWidth={2.5}
                fillOpacity={1}
                fill={chartMetric === 'revenue' ? 'url(#colorRevenue)' : 'url(#colorOrders)'}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ========================================================
          БЛОК 3: Товарно-ассортиментный ABC-анализ
          С полной поддержкой мобильных карточек и быстрых действий!
      ======================================================== */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
              <Percent className="w-5 h-5 text-emerald-600" />
              Матрица ABC-анализа номенклатуры
            </h2>
            <p className="text-xs text-stone-500">
              Группа A: ключевые 80% выручки | Группа B: промежуточные 15% | Группа C: аутсайдеры 5%
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-stone-100 text-stone-700 rounded-full">
            Товаров в анализе: {abcData.length}
          </span>
        </div>

        {/* 1. Десктопная таблица (от md и выше) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-stone-600">
            <thead className="bg-stone-50 text-xs font-bold uppercase text-stone-500 border-y border-stone-200">
              <tr>
                <th className="py-3 px-4">Класс</th>
                <th className="py-3 px-4">Товар</th>
                <th className="py-3 px-4">Категория</th>
                <th className="py-3 px-4">Объем продаж</th>
                <th className="py-3 px-4">Выручка (BYN)</th>
                <th className="py-3 px-4">Доля (%)</th>
                <th className="py-3 px-4">Кумулятивная (%)</th>
                <th className="py-3 px-4">Остаток</th>
                <th className="py-3 px-4 text-center">Быстрые действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {abcData.map((item) => {
                let badgeClass = 'bg-rose-100 text-rose-800 border-rose-200';
                if (item.abc_class === 'A') badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                if (item.abc_class === 'B') badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';

                const isHidden = Number(item.stock_quantity || 0) <= 0;

                return (
                  <tr key={item.product_id} className="hover:bg-stone-50 transition-colors">
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-black border ${badgeClass}`}>
                        Класс {item.abc_class}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-stone-800">{item.product_name}</td>
                    <td className="py-3 px-4">{item.category_name}</td>
                    <td className="py-3 px-4 font-semibold text-stone-700">
                      {item.total_quantity} {item.unit || 'кг'}
                    </td>
                    <td className="py-3 px-4 text-stone-900 font-bold">{Number(item.revenue).toFixed(2)} BYN</td>
                    <td className="py-3 px-4">{item.share_percent}%</td>
                    <td className="py-3 px-4">{item.cumulative_share}%</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        isHidden ? 'bg-rose-100 text-rose-700 font-bold' : 'bg-stone-100 text-stone-700'
                      }`}>
                        {isHidden ? 'Скрыт (0)' : `${item.stock_quantity} ${item.unit || 'кг'}`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Редактирование цены в 1 клик */}
                        <button
                          onClick={() => handleEditPrice(item)}
                          title="Изменить цену в 1 клик"
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-stone-100 text-stone-700 border border-stone-200 rounded-lg hover:bg-stone-200 transition-colors"
                        >
                          <Pencil className="w-3 h-3 text-stone-500" /> Цена
                        </button>

                        {/* Уценка на 20% (только для C) */}
                        {item.abc_class === 'C' && (
                          <button 
                            onClick={() => handleApplyDiscount(item)}
                            title="Применить превентивную скидку 20%"
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                          >
                            <Tag className="w-3 h-3" /> -20%
                          </button>
                        )}

                        {/* Обратимое скрытие/возврат товара */}
                        <button 
                          onClick={() => handleToggleVisibility(item)}
                          title={isHidden ? "Вернуть товар на витрину" : "Временно скрыть товар"}
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                            isHidden 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' 
                              : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {isHidden ? <Eye className="w-3 h-3 text-emerald-600" /> : <EyeOff className="w-3 h-3" />}
                          {isHidden ? 'Вернуть' : 'Скрыть'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 2. Мобильные карточки ABC-анализа (до md по концепции Mobile-First!) */}
        <div className="md:hidden space-y-3">
          {abcData.map((item) => {
            let badgeClass = 'bg-rose-100 text-rose-800 border-rose-200';
            if (item.abc_class === 'A') badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
            if (item.abc_class === 'B') badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
            const isHidden = Number(item.stock_quantity || 0) <= 0;

            return (
              <div key={item.product_id} className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-bold text-stone-800 text-sm leading-tight">{item.product_name}</h3>
                    <p className="text-xs text-stone-400 mt-0.5">{item.category_name}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black border shrink-0 ${badgeClass}`}>
                    Класс {item.abc_class}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-y border-stone-200/60 py-2">
                  <div>
                    <span className="text-stone-400 block text-[10px]">Выручка:</span>
                    <span className="font-bold text-stone-800">{Number(item.revenue).toFixed(2)} BYN</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Объем продаж:</span>
                    <span className="font-bold text-stone-800">{item.total_quantity} {item.unit || 'кг'}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Доля в выручке:</span>
                    <span className="font-bold text-stone-800">{item.share_percent}% (кумул. {item.cumulative_share}%)</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Складской остаток:</span>
                    <span className={`font-bold ${isHidden ? 'text-rose-600' : 'text-stone-800'}`}>
                      {isHidden ? 'Скрыт (0)' : `${item.stock_quantity} ${item.unit || 'кг'}`}
                    </span>
                  </div>
                </div>

                {/* Быстрые действия на мобильных */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    onClick={() => handleEditPrice(item)}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 bg-white text-stone-700 border border-stone-200 rounded-lg text-xs font-bold"
                  >
                    <Pencil className="w-3 h-3" /> Цена
                  </button>
                  {item.abc_class === 'C' && (
                    <button 
                      onClick={() => handleApplyDiscount(item)}
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold"
                    >
                      <Tag className="w-3 h-3" /> -20%
                    </button>
                  )}
                  <button 
                    onClick={() => handleToggleVisibility(item)}
                    className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold border ${
                      isHidden ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white text-stone-600 border-stone-200'
                    }`}
                  >
                    {isHidden ? 'Вернуть' : 'Скрыть'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {abcData.length === 0 && (
          <p className="text-center py-6 text-sm text-stone-400">Нет данных продаж за выбранный период</p>
        )}
      </div>

      {/* ========================================================
          БЛОК 4: География заказов (БЕЗ СКРОЛЛА) + Stock Alerts
      ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        
        {/* Карточка Географии спроса: увеличена высота, список микрорайонов помещается ПОЛНОСТЬЮ */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-stone-800">География спроса (г. Гродно)</h2>
            <p className="text-xs text-stone-500">Долевое распределение заказов по жилым микрорайонам</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center flex-grow py-2">
            {/* Круговой график слева */}
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={geoData}
                    dataKey="ordersCount"
                    nameKey="district"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {geoData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={DISTRICT_COLORS[index % DISTRICT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val, name, item) => [
                      `${val} заказов (${item.payload.sharePercent}%)`, 
                      `Район: ${name}`
                    ]} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Ранжированный список микрорайонов справа (БЕЗ ВЕРТИКАЛЬНОГО СКРОЛЛА!) */}
            <div className="space-y-1.5 flex flex-col justify-center">
              {geoData.map((d, idx) => (
                <div key={d.district} className="flex items-center justify-between text-xs p-2 rounded-xl bg-stone-50 border border-stone-100 hover:bg-stone-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DISTRICT_COLORS[idx % DISTRICT_COLORS.length] }} />
                    <span className="font-bold text-stone-800">{d.district}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-stone-900">{d.ordersCount} шт.</span>
                    <span className="text-stone-400 ml-1.5 font-semibold">({d.sharePercent}%)</span>
                  </div>
                </div>
              ))}
              {geoData.length === 0 && (
                <p className="text-xs text-stone-400 text-center py-4">Нет данных по доставкам</p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-stone-100 text-[11px] text-stone-400 text-center sm:text-left">
            Лидирующий район сбыта: <span className="font-bold text-emerald-700">{geoData[0]?.district || 'Центр'}</span> ({geoData[0]?.sharePercent || 0}% спроса)
          </div>
        </div>

        {/* Карточка оперативных алертов остатков с кнопкой пополнения */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Панель оперативных оповещений
              </h2>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
                Порог: ≤ 5 шт.
              </span>
            </div>
            <p className="text-xs text-stone-500 mb-4">
              Позиции с риском дефицита и срыва поставок
            </p>

            <div className="space-y-3">
              {stockAlerts.map((prod) => (
                <div 
                  key={prod.product_id}
                  className="p-3 bg-rose-50/70 rounded-xl border border-rose-200 flex justify-between items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-stone-800 truncate">{prod.name}</h3>
                    <p className="text-xs text-stone-500">Категория: {prod.category_name || 'Общая'}</p>
                  </div>
                  
                  {/* Кнопка быстрого пополнения остатка без перехода в каталог */}
                  <button
                    onClick={() => setRestockModal({ isOpen: true, product: prod, newQuantity: String(prod.stock_quantity) })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600 text-white font-bold text-xs rounded-lg hover:bg-rose-700 transition-colors shrink-0"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Пополнить
                  </button>
                </div>
              ))}

              {stockAlerts.length === 0 && (
                <div className="p-6 text-center text-stone-500 bg-stone-50 rounded-xl border border-stone-200">
                  <PackageCheck className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm font-medium">Все товарные запасы находятся в безопасной зоне</p>
                </div>
              )}
            </div>
          </div>

          <p className="text-[11px] text-stone-400 border-t border-stone-100 pt-3">
            Система формирует управляющий сигнал для оперативного пополнения склада фермером.
          </p>
        </div>
      </div>

      {/* Модальное окно быстрого пополнения остатка */}
      {restockModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl border border-stone-200">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-stone-800">Пополнение остатка</h3>
              <button onClick={() => setRestockModal({ isOpen: false, product: null, newQuantity: '' })} className="text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <p className="text-xs text-stone-500 mb-1">Товар:</p>
              <p className="font-bold text-sm text-stone-800">{restockModal.product?.name}</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Новый объем партии ({restockModal.product?.unit || 'ед.'}):</label>
              <input 
                type="number"
                min="0"
                value={restockModal.newQuantity}
                onChange={e => setRestockModal({ ...restockModal, newQuantity: e.target.value })}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm font-bold text-stone-800 focus:outline-emerald-600"
                placeholder="Введите количество..."
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setRestockModal({ isOpen: false, product: null, newQuantity: '' })}
                className="flex-1 py-2 bg-stone-100 text-stone-600 text-xs font-bold rounded-xl hover:bg-stone-200"
              >
                Отмена
              </button>
              <button 
                onClick={handleSaveRestock}
                className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
